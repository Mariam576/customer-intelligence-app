"""FastAPI application: analytics and prediction endpoints for the dashboard.

Run from the backend folder:

    python -m uvicorn app.main:app --port 8010

Interactive API docs are at http://127.0.0.1:8010/docs
"""

from __future__ import annotations

import logging
import os
import threading
import webbrowser
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import churn, config, sales, segments
from .data import DataFileMissing
from .store import Snapshot, Store, build_store

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("customer_intelligence")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.store = build_store()
    except (DataFileMissing, FileNotFoundError) as exc:
        log.error("%s", exc)
        raise SystemExit(1) from exc

    url = os.environ.get("CI_OPEN_BROWSER")
    if url:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    yield


app = FastAPI(
    title="Customer Intelligence API",
    description=(
        "Sales analytics, K-Means customer segments and calibrated CatBoost "
        "90-day non-return probabilities for the Online Retail II data "
        "(Dec 2009 - Dec 2011). Historical demonstration, not live monitoring."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# The Vite dev server runs on another port while developing the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_snapshot(store: Store, snapshot_id: Optional[str]) -> Snapshot:
    try:
        return store.snapshot(snapshot_id)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown snapshot '{snapshot_id}'. Available: {', '.join(store.snapshots)}",
        )


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", tags=["meta"])
def meta(request: Request) -> dict:
    """What data and models are loaded, and which snapshots can be scored."""
    store = get_store(request)
    model_config = store.models.config
    return {
        "project": model_config.get("project"),
        "data": {
            "start": store.data_start.isoformat(),
            "end": store.data_end.isoformat(),
            "sales_lines": int(len(store.sales)),
            "customers": int(len(store.customer_rows)),
        },
        "periods": sales.available_periods(store),
        "snapshots": [snapshot.describe() for snapshot in store.snapshots.values()],
        "default_snapshot": store.default_snapshot,
        "segments": [
            {"cluster": cluster, "name": name}
            for cluster, name in sorted(store.models.segment_names.items())
        ],
        "risk_bands": [
            {"level": name, "min": lower} for name, lower in config.RISK_BANDS
        ],
        "churn_model": {
            "algorithm": model_config["churn_prediction"]["algorithm"],
            "target": model_config["churn_prediction"]["prediction_target"],
            "features": store.models.churn_columns,
            "calibration": model_config["churn_prediction"]["probability_calibration"],
            "training_snapshots": model_config["churn_prediction"]["training_snapshots"],
            "calibration_snapshot": model_config["churn_prediction"]["calibration_snapshot"],
            "evaluation_snapshot": model_config["churn_prediction"]["evaluation_snapshot"],
            "horizon_days": store.models.horizon_days,
        },
    }


@app.get("/api/sales", tags=["sales"])
def sales_overview(
    request: Request,
    period: str = Query("all", description="'all' or a calendar year such as 2011"),
) -> dict:
    """KPIs, monthly trend, top products and sales by country."""
    store = get_store(request)
    valid = {item["id"] for item in sales.available_periods(store)}
    if period not in valid:
        raise HTTPException(404, f"Unknown period '{period}'. Available: {', '.join(sorted(valid))}")
    return sales.sales_overview(store, period)


@app.get("/api/segments", tags=["segments"])
def segment_overview(request: Request) -> dict:
    """The four K-Means segments: size, spend, behaviour, and a sample to plot."""
    return segments.segment_overview(get_store(request))


@app.get("/api/churn/summary", tags=["churn"])
def churn_summary(
    request: Request,
    snapshot: Optional[str] = Query(None, description="Snapshot id from /api/meta"),
) -> dict:
    """Risk bands and, for the held-out snapshot, how the scores held up."""
    store = get_store(request)
    return churn.churn_summary(store, get_snapshot(store, snapshot))


@app.get("/api/customers", tags=["churn"])
def list_customers(
    request: Request,
    snapshot: Optional[str] = None,
    search: str = Query("", max_length=20, description="Customer ID starts with"),
    segment: Optional[int] = Query(None, ge=0, le=3),
    risk: Optional[Literal["High", "Medium", "Low"]] = None,
    sort: Literal["probability", "monetary", "frequency", "recency", "customer_id"] = "probability",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
) -> dict:
    """Scored customers, filterable and paged."""
    store = get_store(request)
    return churn.list_customers(
        store,
        get_snapshot(store, snapshot),
        search=search,
        segment=segment,
        risk=risk,
        sort=sort,
        descending=order == "desc",
        page=page,
        page_size=page_size,
    )


@app.get("/api/customers/{customer_id}", tags=["churn"])
def customer_profile(
    request: Request, customer_id: str, snapshot: Optional[str] = None
) -> dict:
    """One customer: purchase history, segment and 90-day non-return probability."""
    store = get_store(request)
    selected = get_snapshot(store, snapshot)
    profile = churn.customer_profile(store, selected, customer_id.strip())
    if profile is None:
        known = customer_id.strip() in store.customer_rows
        detail = (
            f"Customer {customer_id} had not bought anything before {selected.label}, "
            "so there is no history to score at that date."
            if known
            else f"No customer with ID {customer_id}."
        )
        raise HTTPException(status_code=404, detail=detail)
    return profile


@app.exception_handler(404)
async def not_found(request: Request, exc):
    """Unknown API paths stay JSON 404s; everything else loads the React app."""
    index = config.FRONTEND_DIST / "index.html"
    path = request.url.path
    is_page = not path.startswith(("/api", "/assets")) and "." not in path.rsplit("/", 1)[-1]
    if not is_page or not index.exists():
        detail = getattr(exc, "detail", "Not found")
        return JSONResponse({"detail": detail}, status_code=404)
    return FileResponse(index)


if config.FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="frontend")
