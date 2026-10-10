"""Load the four saved models and run them.

* K-Means + StandardScaler -> customer segment (from log1p of Recency,
  Frequency and Monetary)
* CatBoost + Platt calibrator -> probability of no purchase in the next 90 days
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool

from . import config


def _load_joblib(path: Path):
    # The models were saved in Colab; a newer scikit-learn warns on load but
    # these three estimators (scaler, k-means, logistic regression) load fine.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return joblib.load(path)


def risk_level(probability: float) -> str:
    for name, lower_bound in config.RISK_BANDS:
        if probability >= lower_bound:
            return name
    return config.RISK_BANDS[-1][0]


class ModelBundle:
    def __init__(self, models_dir: Path = config.MODELS_DIR):
        missing = [
            name
            for name in (
                config.CATBOOST_FILE,
                config.CALIBRATOR_FILE,
                config.KMEANS_FILE,
                config.SCALER_FILE,
                config.MODEL_CONFIG_FILE,
            )
            if not (models_dir / name).exists()
        ]
        if missing:
            raise FileNotFoundError(
                f"Missing model files in {models_dir}: {', '.join(missing)}"
            )

        self.config = json.loads((models_dir / config.MODEL_CONFIG_FILE).read_text())
        segmentation = self.config["segmentation"]
        churn = self.config["churn_prediction"]

        self.rfm_columns: list[str] = segmentation["input_features"]
        self.segment_names: dict[int, str] = {
            int(key): value for key, value in segmentation["segment_names"].items()
        }
        self.churn_columns: list[str] = churn["feature_columns"]
        self.horizon_days: int = int(churn["forecast_horizon_days"])

        self.scaler = _load_joblib(models_dir / config.SCALER_FILE)
        self.kmeans = _load_joblib(models_dir / config.KMEANS_FILE)
        self.calibrator = _load_joblib(models_dir / config.CALIBRATOR_FILE)
        self.catboost = CatBoostClassifier()
        self.catboost.load_model(str(models_dir / config.CATBOOST_FILE))

        if list(self.catboost.feature_names_) != self.churn_columns:
            raise ValueError(
                "model_config.json lists different churn features than the "
                "CatBoost model was trained on."
            )

        # Platt scaling is one line: p = sigmoid(slope * logit(raw) + intercept)
        self.platt_slope = float(self.calibrator.coef_[0, 0])
        self.platt_intercept = float(self.calibrator.intercept_[0])

    # ---- segmentation -------------------------------------------------

    def segment(self, features: pd.DataFrame) -> np.ndarray:
        """Cluster id (0-3) for each row."""
        rfm_log = np.log1p(features[self.rfm_columns].astype(float))
        scaled = self.scaler.transform(rfm_log)
        return self.kmeans.predict(np.asarray(scaled, dtype=float))

    # ---- churn --------------------------------------------------------

    def raw_probability(self, features: pd.DataFrame) -> np.ndarray:
        return self.catboost.predict_proba(features[self.churn_columns])[:, 1]

    def calibrate(self, raw: np.ndarray) -> np.ndarray:
        clipped = np.clip(raw, config.LOGIT_EPS, 1 - config.LOGIT_EPS)
        logit = np.log(clipped / (1 - clipped)).reshape(-1, 1)
        return self.calibrator.predict_proba(logit)[:, 1]

    def score(self, features: pd.DataFrame) -> pd.DataFrame:
        """Add segment and churn columns to a feature table."""
        scored = features.copy()
        scored["Cluster"] = self.segment(features)
        scored["Customer_Segment"] = scored["Cluster"].map(self.segment_names)
        raw = self.raw_probability(features)
        scored["Raw_Probability"] = raw
        scored["Probability"] = self.calibrate(raw)
        scored["Risk_Level"] = [risk_level(p) for p in scored["Probability"]]
        return scored

    def explain(self, features: pd.DataFrame) -> list[dict]:
        """Per-feature push on one customer's risk.

        CatBoost SHAP values are in log-odds of the raw score. Platt scaling
        multiplies log-odds by a constant, so multiplying each SHAP value by
        that slope gives an exact breakdown of the calibrated log-odds.
        Positive = pushes the non-return risk up.
        """
        row = features[self.churn_columns].iloc[[0]]
        shap = self.catboost.get_feature_importance(Pool(row), type="ShapValues")[0]
        contributions = shap[:-1] * self.platt_slope
        drivers = [
            {
                "feature": name,
                "value": float(row.iloc[0][name]),
                "contribution": float(contribution),
            }
            for name, contribution in zip(self.churn_columns, contributions)
        ]
        drivers.sort(key=lambda item: abs(item["contribution"]), reverse=True)
        return drivers
