"""Customer feature engineering.

This mirrors notebook steps 22 and 35 line for line: for a cut-off date,
only transactions strictly before it are used, so a prediction never sees
the period it is predicting.
"""

from __future__ import annotations

import pandas as pd

SECONDS_PER_DAY = 86400


def build_customer_features(transactions: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    """One row per customer who bought before `cutoff`."""
    history = transactions.loc[transactions["InvoiceDate"] < cutoff]

    features = (
        history.groupby("Customer_ID", sort=True)
        .agg(
            First_Purchase=("InvoiceDate", "min"),
            Last_Purchase=("InvoiceDate", "max"),
            Frequency=("Invoice_ID", "nunique"),
            Monetary=("Line_Value", "sum"),
            Total_Units=("Quantity", "sum"),
            Unique_Products=("StockCode", "nunique"),
            Active_Months=("Month_Index", "nunique"),
        )
        .reset_index()
    )

    features["Recency_Days"] = (
        cutoff - features["Last_Purchase"]
    ).dt.total_seconds() / SECONDS_PER_DAY
    features["Customer_Tenure_Days"] = (
        cutoff - features["First_Purchase"]
    ).dt.total_seconds() / SECONDS_PER_DAY
    features["Avg_Invoice_Value"] = features["Monetary"] / features["Frequency"]

    return features


def label_non_return(
    transactions: pd.DataFrame,
    customers: pd.Series,
    cutoff: pd.Timestamp,
    horizon_days: int,
) -> pd.Series:
    """1 when a customer made no purchase in the `horizon_days` after `cutoff`.

    Used only to show what actually happened next. Never fed to a model.
    """
    window_end = cutoff + pd.Timedelta(days=horizon_days)
    future = transactions.loc[
        (transactions["InvoiceDate"] >= cutoff)
        & (transactions["InvoiceDate"] < window_end)
    ]
    returning = set(future["Customer_ID"])
    return (~customers.isin(returning)).astype(int)
