"""Sales dashboard analytics (pandas only, no model)."""

from __future__ import annotations

import calendar

import pandas as pd

from .store import Store
from .util import records

TOP_PRODUCTS = 10


def available_periods(store: Store) -> list[dict]:
    """'All' plus every calendar year with a full January-to-end run of data."""
    periods = [{"id": "all", "label": "All time"}]
    months_per_year = store.sales.groupby(store.sales["InvoiceDate"].dt.year)["Month"].nunique()
    for year, months in months_per_year.items():
        if months >= 6:
            periods.append({"id": str(int(year)), "label": str(int(year))})
    return periods


def _partial_month(store: Store, month: str) -> tuple[bool, int, int]:
    """Whether the data covers only part of this calendar month."""
    year, month_number = int(month[:4]), int(month[5:7])
    days_in_month = calendar.monthrange(year, month_number)[1]
    first_day = 1
    last_day = days_in_month
    if (store.data_start.year, store.data_start.month) == (year, month_number):
        first_day = store.data_start.day
    if (store.data_end.year, store.data_end.month) == (year, month_number):
        last_day = store.data_end.day
    covered = last_day - first_day + 1
    return covered < days_in_month, covered, days_in_month


def sales_overview(store: Store, period: str = "all") -> dict:
    cache_key = ("sales", period)
    if cache_key in store.cache:
        return store.cache[cache_key]

    frame = store.sales
    if period != "all":
        frame = frame.loc[frame["InvoiceDate"].dt.year == int(period)]

    gross = float(frame["Line_Value"].sum())
    invoices = int(frame["Invoice"].nunique())
    identified = frame.loc[frame["Customer_ID"].notna()]

    kpis = {
        "gross_sales": gross,
        "units": int(frame["Quantity"].sum()),
        "invoices": invoices,
        "avg_invoice_value": gross / invoices if invoices else 0.0,
        "identified_customers": int(identified["Customer_ID"].nunique()),
        "products": int(frame["StockCode_Clean"].nunique()),
        "countries": int(frame["Country"].nunique()),
        "identified_sales_share": float(identified["Line_Value"].sum() / gross) if gross else 0.0,
        "sales_lines": int(len(frame)),
    }

    monthly = (
        frame.groupby("Month")
        .agg(
            gross_sales=("Line_Value", "sum"),
            units=("Quantity", "sum"),
            invoices=("Invoice", "nunique"),
            customers=("Customer_ID", "nunique"),
        )
        .reset_index()
        .rename(columns={"Month": "month"})
        .sort_values("month")
    )
    monthly["avg_invoice_value"] = monthly["gross_sales"] / monthly["invoices"]
    coverage = [_partial_month(store, month) for month in monthly["month"]]
    monthly["partial"] = [item[0] for item in coverage]
    monthly["days_covered"] = [item[1] for item in coverage]
    monthly["days_in_month"] = [item[2] for item in coverage]

    products = (
        frame.groupby("StockCode_Clean")
        .agg(
            gross_sales=("Line_Value", "sum"),
            units=("Quantity", "sum"),
            invoices=("Invoice", "nunique"),
        )
        .reset_index()
        .rename(columns={"StockCode_Clean": "code"})
    )
    top_by_sales = products.nlargest(TOP_PRODUCTS, "gross_sales")
    top_by_units = products.nlargest(TOP_PRODUCTS, "units")
    wanted = set(top_by_sales["code"]) | set(top_by_units["code"])
    # A product code can carry several spellings of its name; use the commonest.
    names = (
        frame.loc[frame["StockCode_Clean"].isin(wanted)]
        .groupby("StockCode_Clean")["Description"]
        .agg(lambda values: values.value_counts().index[0])
    )
    for table in (top_by_sales, top_by_units):
        table.insert(1, "name", table["code"].map(names))
        table["sales_share"] = table["gross_sales"] / gross if gross else 0.0

    countries = (
        frame.groupby("Country")
        .agg(
            gross_sales=("Line_Value", "sum"),
            units=("Quantity", "sum"),
            invoices=("Invoice", "nunique"),
            customers=("Customer_ID", "nunique"),
        )
        .reset_index()
        .rename(columns={"Country": "country"})
        .sort_values("gross_sales", ascending=False)
    )
    countries["share"] = countries["gross_sales"] / gross if gross else 0.0

    result = {
        "period": period,
        "date_range": {
            "start": frame["InvoiceDate"].min().isoformat(),
            "end": frame["InvoiceDate"].max().isoformat(),
        },
        "kpis": kpis,
        "monthly": records(monthly),
        "top_products": {
            "by_sales": records(top_by_sales),
            "by_units": records(top_by_units),
        },
        "countries": records(countries),
    }
    store.cache[cache_key] = result
    return result
