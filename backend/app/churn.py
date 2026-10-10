"""Churn page analytics: snapshot summary, customer list, customer profile."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config
from .store import Snapshot, Store
from .util import records

SORT_COLUMNS = {
    "probability": "Probability",
    "monetary": "Monetary",
    "frequency": "Frequency",
    "recency": "Recency_Days",
    "customer_id": "Customer_ID",
}

FEATURE_LABELS = {
    "Frequency": "Invoices",
    "Monetary": "Total spend",
    "Total_Units": "Units bought",
    "Unique_Products": "Different products",
    "Recency_Days": "Days since last purchase",
    "Customer_Tenure_Days": "Days since first purchase",
    "Avg_Invoice_Value": "Average invoice value",
    "Active_Months": "Months with a purchase",
}

HISTOGRAM_BINS = 20


def _band_edges() -> list[tuple[str, float, float]]:
    """[(name, lower, upper)] from highest to lowest."""
    edges = []
    upper = 1.0
    for name, lower in config.RISK_BANDS:
        edges.append((name, lower, upper))
        upper = lower
    return edges


def churn_summary(store: Store, snapshot: Snapshot) -> dict:
    cache_key = ("churn_summary", snapshot.id)
    if cache_key in store.cache:
        return store.cache[cache_key]

    scored = snapshot.scored
    total = len(scored)

    bands = []
    for name, lower, upper in _band_edges():
        members = scored.loc[scored["Risk_Level"] == name]
        bands.append(
            {
                "level": name,
                "min": lower,
                "max": upper,
                "customers": int(len(members)),
                "share": float(len(members) / total) if total else 0.0,
                "mean_probability": float(members["Probability"].mean()) if len(members) else None,
                "total_spend": float(members["Monetary"].sum()),
                "actual_non_return_rate": (
                    float(members["Churn_90D"].mean())
                    if snapshot.outcome_known and len(members)
                    else None
                ),
            }
        )

    by_segment = (
        scored.groupby("Cluster")
        .agg(
            customers=("Customer_ID", "count"),
            mean_probability=("Probability", "mean"),
            high_risk_customers=("Risk_Level", lambda levels: int((levels == "High").sum())),
            total_spend=("Monetary", "sum"),
        )
        .reset_index()
        .rename(columns={"Cluster": "cluster"})
    )
    by_segment["name"] = by_segment["cluster"].map(store.models.segment_names)
    by_segment = by_segment.sort_values("total_spend", ascending=False)

    edges = np.linspace(0, 1, HISTOGRAM_BINS + 1)
    bin_index = np.clip(
        np.digitize(scored["Probability"].to_numpy(), edges, right=False) - 1,
        0,
        HISTOGRAM_BINS - 1,
    )
    histogram = []
    for index in range(HISTOGRAM_BINS):
        in_bin = bin_index == index
        lower = float(edges[index])
        histogram.append(
            {
                "bin_start": lower,
                "bin_end": float(edges[index + 1]),
                "customers": int(in_bin.sum()),
                "level": next(name for name, bound in config.RISK_BANDS if lower >= bound),
                "actual_non_return_rate": (
                    float(scored["Churn_90D"].to_numpy()[in_bin].mean())
                    if snapshot.outcome_known and in_bin.any()
                    else None
                ),
            }
        )

    result = {
        "snapshot": snapshot.describe(),
        "horizon_days": store.models.horizon_days,
        "customers": int(total),
        "mean_probability": float(scored["Probability"].mean()),
        "bands": bands,
        "by_segment": records(by_segment),
        "histogram": histogram,
        "evaluation": snapshot.evaluation,
    }
    store.cache[cache_key] = result
    return result


def list_customers(
    store: Store,
    snapshot: Snapshot,
    *,
    search: str = "",
    segment: int | None = None,
    risk: str | None = None,
    sort: str = "probability",
    descending: bool = True,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    scored = snapshot.scored
    mask = np.ones(len(scored), dtype=bool)
    if search:
        mask &= scored["Customer_ID"].str.startswith(search.strip()).to_numpy()
    if segment is not None:
        mask &= (scored["Cluster"] == segment).to_numpy()
    if risk:
        mask &= (scored["Risk_Level"] == risk).to_numpy()

    selected = scored.loc[mask]
    column = SORT_COLUMNS.get(sort, "Probability")
    selected = selected.sort_values(
        [column, "Customer_ID"], ascending=[not descending, True], kind="stable"
    )

    total = len(selected)
    start = (page - 1) * page_size
    page_rows = selected.iloc[start : start + page_size]

    rows = page_rows[
        [
            "Customer_ID",
            "Country",
            "Cluster",
            "Customer_Segment",
            "Frequency",
            "Monetary",
            "Recency_Days",
            "Probability",
            "Risk_Level",
        ]
    ].rename(
        columns={
            "Customer_ID": "customer_id",
            "Country": "country",
            "Cluster": "cluster",
            "Customer_Segment": "segment",
            "Frequency": "frequency",
            "Monetary": "monetary",
            "Recency_Days": "recency_days",
            "Probability": "probability",
            "Risk_Level": "risk_level",
        }
    )

    return {
        "snapshot": snapshot.id,
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "pages": int(max(1, -(-total // page_size))),
        "customers": records(rows),
    }


def _month_range(start: pd.Timestamp, end: pd.Timestamp) -> list[str]:
    return [str(period) for period in pd.period_range(start=start, end=end, freq="M")]


def customer_profile(store: Store, snapshot: Snapshot, customer_id: str) -> dict | None:
    if customer_id not in snapshot.scored.index:
        return None

    row = snapshot.scored.loc[customer_id]
    models = store.models
    transactions = store.customer_transactions(customer_id)
    history = transactions.loc[transactions["InvoiceDate"] < snapshot.cutoff]

    invoices = store.invoices.loc[
        (store.invoices["Customer_ID"] == customer_id)
        & (store.invoices["Date"] < snapshot.cutoff)
    ].sort_values("Date", ascending=False)

    # Spend per calendar month on a fixed axis (start of data -> snapshot),
    # so charts for different customers can be compared at a glance.
    last_history_day = snapshot.cutoff - pd.Timedelta(seconds=1)
    months = _month_range(store.data_start, last_history_day)
    month_key = history["InvoiceDate"].dt.strftime("%Y-%m")
    spend_by_month = history.groupby(month_key)["Line_Value"].sum()
    invoices_by_month = history.groupby(month_key)["Invoice_ID"].nunique()
    monthly = [
        {
            "month": month,
            "spend": float(spend_by_month.get(month, 0.0)),
            "invoices": int(invoices_by_month.get(month, 0)),
        }
        for month in months
    ]

    top_products = (
        history.groupby("StockCode_Clean")
        .agg(
            name=("Description", lambda values: values.value_counts().index[0]),
            units=("Quantity", "sum"),
            spend=("Line_Value", "sum"),
            invoices=("Invoice_ID", "nunique"),
        )
        .reset_index()
        .rename(columns={"StockCode_Clean": "code"})
        .nlargest(5, "spend")
    )

    feature_frame = pd.DataFrame([row[models.churn_columns].astype(float)])
    drivers = models.explain(feature_frame)
    for driver in drivers:
        driver["label"] = FEATURE_LABELS.get(driver["feature"], driver["feature"])

    outcome = None
    if snapshot.outcome_known:
        window = transactions.loc[
            (transactions["InvoiceDate"] >= snapshot.cutoff)
            & (transactions["InvoiceDate"] < snapshot.window_end)
        ]
        outcome = {
            "returned": bool(len(window)),
            "first_purchase_date": (
                window["InvoiceDate"].min().isoformat() if len(window) else None
            ),
            "invoices": int(window["Invoice_ID"].nunique()),
            "spend": float(window["Line_Value"].sum()),
            "window_start": snapshot.cutoff.isoformat(),
            "window_end": snapshot.window_end.isoformat(),
        }

    rank = int((snapshot.scored["Probability"] > row["Probability"]).sum()) + 1

    return {
        "customer_id": customer_id,
        "snapshot": snapshot.describe(),
        "country": row["Country"],
        "first_purchase": row["First_Purchase"].isoformat(),
        "last_purchase": row["Last_Purchase"].isoformat(),
        "segment": {
            "cluster": int(row["Cluster"]),
            "name": row["Customer_Segment"],
            "inputs": {name: float(row[name]) for name in models.rfm_columns},
        },
        "churn": {
            "probability": float(row["Probability"]),
            "raw_probability": float(row["Raw_Probability"]),
            "risk_level": row["Risk_Level"],
            "horizon_days": models.horizon_days,
            "rank": rank,
            "out_of": int(len(snapshot.scored)),
        },
        "features": [
            {
                "feature": name,
                "label": FEATURE_LABELS.get(name, name),
                "value": float(row[name]),
            }
            for name in models.churn_columns
        ],
        "drivers": drivers,
        "history": {
            "invoices": records(
                invoices[["Invoice_ID", "Date", "Lines", "Units", "Value"]].rename(
                    columns={
                        "Invoice_ID": "invoice_id",
                        "Date": "date",
                        "Lines": "lines",
                        "Units": "units",
                        "Value": "value",
                    }
                )
            ),
            "monthly": monthly,
            "top_products": records(top_products),
        },
        "outcome": outcome,
    }
