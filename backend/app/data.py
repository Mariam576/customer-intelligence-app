"""Load the cleaned CSV exports, with a compact on-disk cache.

Two files are used, exactly as exported by the notebook:

* step20_cleaned_merchandise_sales.csv  - every positive merchandise sales
  line, including lines with no customer ID. Feeds the sales dashboard.
* step21_customer_transactions.csv      - the same lines restricted to
  identified customers. Feeds segmentation and churn features.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import pandas as pd

from . import config

log = logging.getLogger("customer_intelligence.data")

SALES_COLUMNS = [
    "Invoice",
    "StockCode_Clean",
    "Description",
    "Quantity",
    "InvoiceDate",
    "Line_Value",
    "Customer ID",
    "Country",
]

TRANSACTION_COLUMNS = [
    "Customer_ID",
    "Invoice_ID",
    "InvoiceDate",
    "StockCode",
    "StockCode_Clean",
    "Description",
    "Quantity",
    "Line_Value",
    "Country",
]

# Bump when the cached column set or dtypes change.
CACHE_VERSION = 2


class DataFileMissing(FileNotFoundError):
    """Raised with a message a person can act on."""


def _source_path(filename: str) -> Path:
    path = config.DATA_DIR / filename
    if not path.exists():
        raise DataFileMissing(
            f"Could not find {filename} in {config.DATA_DIR}. "
            "Put the file there, or set the CI_DATA_DIR environment variable "
            "to the folder that contains it."
        )
    return path


def _signature(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size": stat.st_size,
        "mtime": int(stat.st_mtime),
        "cache_version": CACHE_VERSION,
    }


def _cached(name: str, source: Path, build) -> pd.DataFrame:
    """Return the parquet copy of `source`, rebuilding it when the CSV changed."""
    cache_file = config.CACHE_DIR / f"{name}.parquet"
    meta_file = config.CACHE_DIR / f"{name}.json"
    signature = _signature(source)

    if cache_file.exists() and meta_file.exists():
        try:
            if json.loads(meta_file.read_text()) == signature:
                return pd.read_parquet(cache_file)
        except Exception as exc:  # corrupt cache: rebuild it
            log.warning("Ignoring unreadable cache for %s (%s)", name, exc)

    started = time.perf_counter()
    log.info("Reading %s (first start only, this takes a few seconds)...", source.name)
    frame = build(source)
    log.info("Read %s rows from %s in %.1fs", f"{len(frame):,}", source.name,
             time.perf_counter() - started)

    try:
        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        frame.to_parquet(cache_file, index=False)
        meta_file.write_text(json.dumps(signature))
    except Exception as exc:  # cache is an optimisation, never a requirement
        log.warning("Could not write cache for %s (%s)", name, exc)
    return frame


def _build_sales(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(
        path,
        usecols=SALES_COLUMNS,
        dtype={
            "Invoice": "string",
            "StockCode_Clean": "string",
            "Description": "string",
            "Country": "string",
        },
        low_memory=False,
    )
    frame["InvoiceDate"] = pd.to_datetime(frame["InvoiceDate"])
    frame["Description"] = frame["Description"].str.strip()
    frame = frame.rename(columns={"Customer ID": "Customer_ID"})
    # Nullable integer: missing means the sale had no identified customer.
    frame["Customer_ID"] = frame["Customer_ID"].astype("Int64")
    return frame


def _build_transactions(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(
        path,
        usecols=TRANSACTION_COLUMNS,
        dtype={
            "Customer_ID": "string",
            "Invoice_ID": "string",
            "StockCode": "string",
            "StockCode_Clean": "string",
            "Description": "string",
            "Country": "string",
        },
        low_memory=False,
    )
    frame["InvoiceDate"] = pd.to_datetime(frame["InvoiceDate"])
    frame["Description"] = frame["Description"].str.strip()
    return frame


def _plain_strings(frame: pd.DataFrame) -> pd.DataFrame:
    """Use ordinary Python strings so behaviour is the same on pandas 2 and 3."""
    for column in frame.columns:
        if pd.api.types.is_string_dtype(frame[column]) and frame[column].dtype != object:
            frame[column] = frame[column].astype(object)
    return frame


def load_sales() -> pd.DataFrame:
    frame = _cached("sales", _source_path(config.SALES_CSV), _build_sales)
    frame = _plain_strings(frame)
    # "2011-03" style month key. Built from integers because strftime on a
    # million rows takes several seconds.
    year_month = frame["InvoiceDate"].dt.year * 100 + frame["InvoiceDate"].dt.month
    labels = {key: f"{key // 100}-{key % 100:02d}" for key in year_month.unique()}
    frame["Month"] = year_month.map(labels)
    return frame


def load_transactions() -> pd.DataFrame:
    frame = _cached(
        "transactions", _source_path(config.TRANSACTIONS_CSV), _build_transactions
    )
    frame = _plain_strings(frame)
    # Sorting once makes every per-customer lookup a contiguous slice.
    frame = frame.sort_values(["Customer_ID", "InvoiceDate"], kind="stable")
    frame = frame.reset_index(drop=True)
    # Calendar month as one integer, used for the Active_Months feature.
    frame["Month_Index"] = (
        frame["InvoiceDate"].dt.year * 12 + frame["InvoiceDate"].dt.month
    )
    return frame
