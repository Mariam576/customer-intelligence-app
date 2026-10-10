# Customer Intelligence

A three-page dashboard for the Online Retail II project:

| Page | What it shows | Where the numbers come from |
| --- | --- | --- |
| Sales | Total sales, monthly trend, top products, sales by country | Pandas analytics on `step20_cleaned_merchandise_sales.csv` |
| Customer segments | The four K-Means customer groups, their size and behaviour | `step23` scaler + `step26` K-Means on features built from `step21_customer_transactions.csv` |
| Churn prediction | Pick a customer: purchase history, segment, 90-day non-return probability | `step37` CatBoost + `step41` Platt calibrator on the same features |

It is a historical demonstration on 2009–2011 data, not live customer monitoring.

## Run it

**Windows:** double-click `start.bat`.

The first run creates a Python environment in `backend\.venv`, installs the
packages (a few minutes), reads the two large CSV files, and opens
http://127.0.0.1:8010 in your browser. Later starts take a couple of seconds.

**By hand** (any system), from the `backend` folder:

```
python -m venv .venv
.venv\Scripts\activate            (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8010
```

Then open http://127.0.0.1:8010. Python 3.10 or newer is recommended.
Node.js is **not** needed to run the app: the built React app is in
`frontend/dist` and FastAPI serves it.

### Where the data is read from

The backend looks for the two CSV files in the folder that contains this
project folder. With the project in `Downloads\customer-intelligence-app`,
that is your Downloads folder, where the files already are:

- `step20_cleaned_merchandise_sales.csv`
- `step21_customer_transactions.csv`

To keep them somewhere else, set the `CI_DATA_DIR` environment variable to
that folder before starting. The CSVs are never changed. A compact copy is
kept in `backend/cache` so later starts are fast; delete that folder any time.

The four model files and `model_config.json` are copies of the notebook
exports and live in `backend/models`.

## Check it against the notebook

```
cd backend
python verify.py
```

This recalculates everything from the raw transactions and compares it with
the files the notebook saved (features, probabilities, test metrics,
segments, sales totals). All six checks pass on the files this was built
with: the backend reproduces the notebook's probabilities to 16 decimal
places and assigns all 5,852 customers to the same segment.

## How the churn page works

- **Features are built in the backend** from transactions strictly before the
  snapshot date, the same way as notebook steps 22 and 35. The model is never
  shown the period it is predicting.
- **Two snapshot dates** can be scored:
  - **1 Jul 2011** – the held-out test from the notebook. The model was
    trained on Oct 2010 and Jan 2011 and calibrated on Apr 2011, so this date
    is a fair test, and the page can show what each customer actually did in
    the following 90 days.
  - **10 Dec 2011** – the end of the data. Every customer is scored, but the
    following 90 days were never recorded, so the scores cannot be checked.
- **Risk bands** use the calibrated probability, as in notebook step 43:
  High from 75%, Medium from 40%, Low below that. Change them in
  `backend/app/config.py`.
- **"What is driving this score"** uses CatBoost SHAP values for that one
  customer.

The segment shown on the churn page is the customer's segment *on the
snapshot date*, so on 1 Jul 2011 it can differ from the segments page, which
uses the end of the data.

## API

Interactive docs: http://127.0.0.1:8010/docs

| Endpoint | Returns |
| --- | --- |
| `GET /api/meta` | Data range, snapshots, segment names, model details |
| `GET /api/sales?period=all\|2010\|2011` | KPIs, monthly sales, top products, countries |
| `GET /api/segments` | Segment summary and a sample of customers to plot |
| `GET /api/churn/summary?snapshot=` | Risk bands, score distribution, test metrics |
| `GET /api/customers?snapshot=&search=&segment=&risk=&sort=&order=&page=` | Scored customer list |
| `GET /api/customers/{id}?snapshot=` | One customer: history, segment, probability, drivers, outcome |

## Project layout

```
backend/
  app/
    config.py     paths, risk bands, snapshot dates
    data.py       reads the CSVs (with cache)
    features.py   customer features for a cut-off date
    scoring.py    loads and runs K-Means, scaler, CatBoost, calibrator
    store.py      builds everything once at start-up
    sales.py      sales page analytics
    segments.py   segments page analytics
    churn.py      churn page analytics
    main.py       FastAPI routes
  models/         the four saved models + model_config.json
  verify.py       checks against the notebook's saved outputs
  requirements.txt
frontend/
  src/            React + Tailwind CSS + Recharts source
  dist/           built app served by FastAPI
start.bat
```

## Changing the frontend

Needs Node.js 20 or newer.

```
cd frontend
npm install
npm run dev        (http://localhost:5173, with the backend running on 8010)
npm run build      (updates frontend/dist)
```

## Things to know about the data

- Sales are positive merchandise lines only. Returns were excluded during
  cleaning, so an order that was later cancelled still counts as a sale.
  One example is visible on the Sales page: "Paper Craft, Little Birdie"
  ranks fourth by value from a single invoice of 80,995 units.
- December 2011 has nine days of data, so it is drawn as a separate hollow
  point on the monthly chart instead of looking like a collapse in sales.
- About 13% of sales value has no customer ID. It is in the sales page but
  cannot appear in segments or churn.
- Docker is not set up yet.
