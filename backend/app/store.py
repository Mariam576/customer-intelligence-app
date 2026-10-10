"""In-memory state: data, models, and the scored customer snapshots.

Built once at start-up and shared by every request.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)

from . import config, data, features
from .scoring import ModelBundle

log = logging.getLogger("customer_intelligence.store")


@dataclass
class Snapshot:
    """Every customer scored as of one cut-off date."""

    id: str
    label: str
    role: str  # "evaluation" or "latest"
    cutoff: pd.Timestamp
    window_end: pd.Timestamp
    outcome_known: bool
    scored: pd.DataFrame  # one row per customer, indexed by Customer_ID
    evaluation: dict | None = None

    def describe(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "role": self.role,
            "cutoff": self.cutoff.isoformat(),
            "window_end": self.window_end.isoformat(),
            "outcome_known": self.outcome_known,
            "customers": int(len(self.scored)),
        }


@dataclass
class Store:
    models: ModelBundle
    sales: pd.DataFrame
    transactions: pd.DataFrame
    invoices: pd.DataFrame
    customer_rows: dict[str, tuple[int, int]]
    customer_country: pd.Series
    data_start: pd.Timestamp
    data_end: pd.Timestamp
    snapshots: dict[str, Snapshot] = field(default_factory=dict)
    cache: dict = field(default_factory=dict)

    @property
    def default_snapshot(self) -> str:
        return config.EVALUATION_SNAPSHOT

    def snapshot(self, snapshot_id: str | None) -> Snapshot:
        return self.snapshots[snapshot_id or self.default_snapshot]

    def customer_transactions(self, customer_id: str) -> pd.DataFrame:
        start, stop = self.customer_rows[customer_id]
        return self.transactions.iloc[start:stop]


def _evaluate(scored: pd.DataFrame) -> dict:
    """How the scores compared with what customers actually did."""
    actual = scored["Churn_90D"].to_numpy()
    raw = scored["Raw_Probability"].to_numpy()
    calibrated = scored["Probability"].to_numpy()
    predicted = (raw >= config.REPORT_THRESHOLD_RAW).astype(int)
    return {
        "customers": int(len(scored)),
        "base_rate": float(actual.mean()),
        "roc_auc": float(roc_auc_score(actual, calibrated)),
        "pr_auc": float(average_precision_score(actual, calibrated)),
        "brier_raw": float(brier_score_loss(actual, raw)),
        "brier_calibrated": float(brier_score_loss(actual, calibrated)),
        "log_loss_raw": float(log_loss(actual, raw)),
        "log_loss_calibrated": float(log_loss(actual, calibrated)),
        "threshold_raw": config.REPORT_THRESHOLD_RAW,
        "accuracy": float(accuracy_score(actual, predicted)),
        "precision": float(precision_score(actual, predicted, zero_division=0)),
        "recall": float(recall_score(actual, predicted, zero_division=0)),
        "f1": float(f1_score(actual, predicted, zero_division=0)),
    }


def _build_snapshot(
    store: Store, snapshot_id: str, label: str, role: str, cutoff: pd.Timestamp
) -> Snapshot:
    horizon = store.models.horizon_days
    window_end = cutoff + pd.Timedelta(days=horizon)
    # Same rule as notebook step 34: only label when the full window exists.
    outcome_known = bool(window_end <= store.data_end)

    feats = features.build_customer_features(store.transactions, cutoff)
    scored = store.models.score(feats)
    scored["Country"] = scored["Customer_ID"].map(store.customer_country)

    evaluation = None
    if outcome_known:
        scored["Churn_90D"] = features.label_non_return(
            store.transactions, scored["Customer_ID"], cutoff, horizon
        ).to_numpy()
        evaluation = _evaluate(scored)

    scored = scored.set_index("Customer_ID", drop=False)
    scored.index.name = None
    return Snapshot(
        id=snapshot_id,
        label=label,
        role=role,
        cutoff=cutoff,
        window_end=window_end,
        outcome_known=outcome_known,
        scored=scored,
        evaluation=evaluation,
    )


def build_store() -> Store:
    started = time.perf_counter()
    models = ModelBundle()
    sales = data.load_sales()
    transactions = data.load_transactions()

    # Contiguous row range per customer (the table is sorted by customer).
    ids = transactions["Customer_ID"].to_numpy()
    boundaries = np.flatnonzero(ids[1:] != ids[:-1]) + 1
    starts = np.concatenate(([0], boundaries))
    stops = np.concatenate((boundaries, [len(ids)]))
    customer_rows = {
        ids[start]: (int(start), int(stop)) for start, stop in zip(starts, stops)
    }

    invoices = (
        transactions.groupby(["Customer_ID", "Invoice_ID"], sort=False)
        .agg(
            Date=("InvoiceDate", "min"),
            Lines=("Line_Value", "size"),
            Units=("Quantity", "sum"),
            Value=("Line_Value", "sum"),
        )
        .reset_index()
    )

    # A handful of customers ship to more than one country; keep the commonest.
    country_lines = (
        transactions.groupby(["Customer_ID", "Country"], sort=False)
        .size()
        .reset_index(name="lines")
        .sort_values("lines", ascending=False, kind="stable")
    )
    customer_country = country_lines.drop_duplicates("Customer_ID").set_index(
        "Customer_ID"
    )["Country"]

    store = Store(
        models=models,
        sales=sales,
        transactions=transactions,
        invoices=invoices,
        customer_rows=customer_rows,
        customer_country=customer_country,
        data_start=sales["InvoiceDate"].min(),
        data_end=sales["InvoiceDate"].max(),
    )

    evaluation_cutoff = pd.Timestamp(config.EVALUATION_SNAPSHOT)
    store.snapshots[config.EVALUATION_SNAPSHOT] = _build_snapshot(
        store,
        config.EVALUATION_SNAPSHOT,
        _format_date(evaluation_cutoff),
        "evaluation",
        evaluation_cutoff,
    )

    # Same reference date as notebook step 22: one day after the last sale.
    latest_cutoff = transactions["InvoiceDate"].max() + pd.Timedelta(days=1)
    store.snapshots[config.LATEST_SNAPSHOT_ID] = _build_snapshot(
        store,
        config.LATEST_SNAPSHOT_ID,
        _format_date(latest_cutoff),
        "latest",
        latest_cutoff,
    )

    log.info(
        "Ready in %.1fs: %s sales lines, %s customers, %d snapshots",
        time.perf_counter() - started,
        f"{len(sales):,}",
        f"{len(customer_rows):,}",
        len(store.snapshots),
    )
    return store


def _format_date(value: pd.Timestamp) -> str:
    # %-d is not available on Windows, so build the day by hand.
    return f"{value.day} {value:%b %Y}"
