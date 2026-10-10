"""Check the backend against the numbers the notebook already saved.

Run from the backend folder:

    python verify.py

Each line compares something the backend recalculates from the raw
transaction CSVs with a file the notebook exported. A check is skipped when
its reference file is not in the data folder.
"""

from __future__ import annotations

import sys
import zipfile
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd

from app import config
from app.sales import sales_overview
from app.segments import segment_overview
from app.store import build_store

results: list[tuple[str, str, str]] = []


def record(name: str, passed: bool | None, detail: str) -> None:
    status = "SKIP" if passed is None else ("PASS" if passed else "FAIL")
    results.append((status, name, detail))


def reference(filename: str, *containers: str) -> pd.DataFrame | None:
    """Find a notebook export either loose, in a folder, or inside its zip."""
    candidates = [config.DATA_DIR / filename]
    candidates += [config.DATA_DIR / folder / filename for folder in containers]
    for path in candidates:
        if path.exists():
            return pd.read_csv(path)
    for container in containers:
        archive = config.DATA_DIR / f"{container}.zip"
        if archive.exists():
            with zipfile.ZipFile(archive) as bundle:
                if filename in bundle.namelist():
                    return pd.read_csv(BytesIO(bundle.read(filename)))
    return None


def main() -> int:
    store = build_store()
    evaluation = store.snapshot(config.EVALUATION_SNAPSHOT)
    latest = store.snapshot(config.LATEST_SNAPSHOT_ID)

    # 1. Churn features at the July 2011 snapshot (notebook step 36)
    expected = reference(
        "step36_chronological_churn_testing.csv", "step36_chronological_churn_splits"
    )
    if expected is None:
        record("Churn features, 1 Jul 2011", None, "step36 testing CSV not found")
    else:
        expected["Customer_ID"] = expected["Customer_ID"].astype(str)
        merged = evaluation.scored.merge(expected, on="Customer_ID", suffixes=("", "_ref"))
        worst = max(
            float(np.abs(merged[name] - merged[f"{name}_ref"]).max())
            for name in store.models.churn_columns
        )
        same_rows = len(merged) == len(expected) == len(evaluation.scored)
        labels_match = bool((merged["Churn_90D"] == merged["Churn_90D_ref"]).all())
        record(
            "Churn features, 1 Jul 2011",
            same_rows and worst < 1e-6 and labels_match,
            f"{len(merged):,} customers, largest feature difference {worst:.1e}, "
            f"outcome labels {'match' if labels_match else 'differ'}",
        )

    # 2. Raw and calibrated probabilities (notebook step 41)
    expected = reference(
        "step41_calibrated_july_customer_predictions.csv",
        "step41_churn_probability_calibration_files",
    )
    if expected is None:
        record("CatBoost + calibration", None, "step41 predictions CSV not found")
    else:
        expected["Customer_ID"] = expected["Customer_ID"].astype(str)
        merged = evaluation.scored.merge(expected, on="Customer_ID")
        raw_gap = float(np.abs(merged["Raw_Probability"] - merged["Original_Probability"]).max())
        calibrated_gap = float(
            np.abs(merged["Probability"] - merged["Calibrated_Probability"]).max()
        )
        record(
            "CatBoost + calibration",
            len(merged) == len(expected) and raw_gap < 1e-9 and calibrated_gap < 1e-9,
            f"{len(merged):,} customers, largest probability difference "
            f"{max(raw_gap, calibrated_gap):.1e}",
        )

    # 3. Test metrics quoted in the report (notebook step 39 / 41)
    metrics = evaluation.evaluation
    expected = reference(
        "step39_chronological_test_metrics.csv", "step39_chronological_test_results"
    )
    if expected is None or metrics is None:
        record("Test metrics", None, "step39 metrics CSV not found")
    else:
        row = expected.loc[expected["Model"] == "Chronological CatBoost"].iloc[0]
        gaps = {
            "accuracy": abs(metrics["accuracy"] - row["Accuracy"]),
            "precision": abs(metrics["precision"] - row["Precision"]),
            "recall": abs(metrics["recall"] - row["Recall"]),
            "roc_auc": abs(metrics["roc_auc"] - row["ROC_AUC"]),
            "brier_raw": abs(metrics["brier_raw"] - row["Brier_Score"]),
        }
        record(
            "Test metrics",
            max(gaps.values()) < 1e-9,
            f"accuracy {metrics['accuracy']:.4f}, precision {metrics['precision']:.4f}, "
            f"recall {metrics['recall']:.4f}, ROC-AUC {metrics['roc_auc']:.4f}, "
            f"Brier {metrics['brier_raw']:.4f} -> {metrics['brier_calibrated']:.4f} calibrated",
        )

    # 4. K-Means segments at the end of the data (notebook step 26)
    expected = reference(
        "step26_segmented_customers.csv", "step26_customer_segmentation_files"
    )
    if expected is None:
        record("K-Means segments", None, "step26 segmented customers CSV not found")
    else:
        expected["Customer_ID"] = expected["Customer_ID"].astype(str)
        merged = latest.scored.merge(expected, on="Customer_ID", suffixes=("", "_ref"))
        agreement = float((merged["Cluster"] == merged["Cluster_ref"]).mean())
        counts = {
            item["name"]: item["customers"] for item in segment_overview(store)["segments"]
        }
        record(
            "K-Means segments",
            len(merged) == len(expected) and agreement == 1.0,
            f"{len(merged):,} customers, {agreement:.1%} assigned to the same segment; "
            + ", ".join(f"{name}: {count:,}" for name, count in counts.items()),
        )

    # 5. Sales totals (notebook step 43)
    expected = reference(
        "step43_dashboard_sales_kpis.csv", "step43_sales_intelligence_analytics"
    )
    kpis = sales_overview(store, "all")["kpis"]
    if expected is None:
        record("Sales totals", None, "step43 KPI CSV not found")
    else:
        row = expected.iloc[0]
        passed = (
            abs(kpis["gross_sales"] - row["Gross_Merchandise_Sales_GBP"]) < 0.01
            and kpis["units"] == row["Total_Units_Sold"]
            and kpis["invoices"] == row["Unique_Invoices"]
            and kpis["identified_customers"] == row["Identified_Customers"]
            and kpis["products"] == row["Unique_Product_Codes"]
        )
        record(
            "Sales totals",
            bool(passed),
            f"gross sales £{kpis['gross_sales']:,.2f}, {kpis['invoices']:,} invoices, "
            f"{kpis['identified_customers']:,} customers, {kpis['products']:,} products",
        )

    expected = reference(
        "step43_monthly_sales_analytics.csv", "step43_sales_intelligence_analytics"
    )
    if expected is None:
        record("Monthly sales", None, "step43 monthly CSV not found")
    else:
        monthly = pd.DataFrame(sales_overview(store, "all")["monthly"])
        merged = monthly.merge(expected, left_on="month", right_on="Sales_Month")
        gap = float(np.abs(merged["gross_sales"] - merged["Gross_Sales"]).max())
        record(
            "Monthly sales",
            len(merged) == len(expected) == len(monthly) and gap < 0.01,
            f"{len(merged)} months, largest difference £{gap:.2f}",
        )

    width = max(len(name) for _, name, _ in results)
    print()
    for status, name, detail in results:
        print(f"{status}  {name.ljust(width)}  {detail}")
    failed = [name for status, name, _ in results if status == "FAIL"]
    print()
    print("All checks passed." if not failed else f"FAILED: {', '.join(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
