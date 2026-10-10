"""Customer segmentation analytics (K-Means on Recency, Frequency, Monetary)."""

from __future__ import annotations

import pandas as pd

from . import config
from .store import Store
from .util import records


def segment_overview(store: Store) -> dict:
    """The four segments as of the end of the data (notebook step 26)."""
    if "segments" in store.cache:
        return store.cache["segments"]

    snapshot = store.snapshot(config.LATEST_SNAPSHOT_ID)
    scored = snapshot.scored
    total_customers = len(scored)
    total_spend = float(scored["Monetary"].sum())

    summary = (
        scored.groupby("Cluster")
        .agg(
            customers=("Customer_ID", "count"),
            median_recency_days=("Recency_Days", "median"),
            median_frequency=("Frequency", "median"),
            median_monetary=("Monetary", "median"),
            total_spend=("Monetary", "sum"),
            mean_probability=("Probability", "mean"),
            high_risk_customers=("Risk_Level", lambda levels: int((levels == "High").sum())),
        )
        .reset_index()
        .rename(columns={"Cluster": "cluster"})
    )
    summary["name"] = summary["cluster"].map(store.models.segment_names)
    summary["customer_share"] = summary["customers"] / total_customers
    summary["spend_share"] = summary["total_spend"] / total_spend
    summary["avg_spend_per_customer"] = summary["total_spend"] / summary["customers"]
    # Most valuable segment first; the order is stable so colours never move.
    summary = summary.sort_values("total_spend", ascending=False)

    columns = {
        "Customer_ID": "customer_id",
        "Cluster": "cluster",
        "Recency_Days": "recency_days",
        "Frequency": "frequency",
        "Monetary": "monetary",
    }
    # A fixed random sample per segment keeps the scatter plots light.
    sample = pd.concat(
        [
            group.sample(
                n=min(len(group), config.SCATTER_POINTS_PER_SEGMENT), random_state=42
            )
            for _, group in scored[list(columns)].groupby("Cluster")
        ],
        ignore_index=True,
    ).rename(columns=columns)

    result = {
        "reference_date": snapshot.cutoff.isoformat(),
        "reference_label": snapshot.label,
        "customers": int(total_customers),
        "total_spend": total_spend,
        "inputs": store.models.rfm_columns,
        "segments": records(summary),
        "scatter": records(sample),
        "scatter_points_per_segment": config.SCATTER_POINTS_PER_SEGMENT,
    }
    store.cache["segments"] = result
    return result
