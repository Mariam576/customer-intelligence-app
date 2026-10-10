"""Paths and constants for the Customer Intelligence backend.

Everything a person might want to change lives here.
"""

from __future__ import annotations

import os
from pathlib import Path

# backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]
# customer-intelligence-app/
PROJECT_DIR = BACKEND_DIR.parent

# Folder that holds the cleaned CSV exports from the notebook.
# By default this is the folder that contains the project folder
# (the project sits inside Downloads, next to the step20/step21 CSVs).
# Set the CI_DATA_DIR environment variable to point somewhere else.
DATA_DIR = Path(os.environ.get("CI_DATA_DIR", PROJECT_DIR.parent)).expanduser()

SALES_CSV = "step20_cleaned_merchandise_sales.csv"
TRANSACTIONS_CSV = "step21_customer_transactions.csv"

# Saved models (copied from the notebook exports) and their config.
MODELS_DIR = BACKEND_DIR / "models"
CATBOOST_FILE = "step37_chronological_catboost_model.cbm"
CALIBRATOR_FILE = "step41_churn_probability_calibrator.joblib"
KMEANS_FILE = "step26_kmeans_4_clusters.joblib"
SCALER_FILE = "step23_rfm_standard_scaler.joblib"
MODEL_CONFIG_FILE = "model_config.json"

# First start reads ~350 MB of CSV; a compact copy is kept here so later
# starts take about a second. Safe to delete at any time.
CACHE_DIR = BACKEND_DIR / "cache"

# Built React app (npm run build). Served by FastAPI when it exists.
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"

# Risk bands on the calibrated probability, as used in notebook step 43.
RISK_BANDS = (
    ("High", 0.75),
    ("Medium", 0.40),
    ("Low", 0.0),
)

# Raw-score cut-off selected on the April 2011 validation snapshot (step 38).
# Only used to reproduce the accuracy / precision / recall quoted in the report.
REPORT_THRESHOLD_RAW = 0.40

# Clip used before taking the logit for Platt scaling (notebook step 41).
LOGIT_EPS = 1e-6

# Snapshot of the held-out evaluation in the notebook. The models never saw
# labels from this date, so it is the fair place to show "what happened next".
EVALUATION_SNAPSHOT = "2011-07-01"
LATEST_SNAPSHOT_ID = "latest"

SCATTER_POINTS_PER_SEGMENT = 350
