import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../lib/api.js";
import { dateLabel, dayBefore, gbpCompact, number, percent } from "../lib/format.js";
import { RISK_LEVELS, SEGMENT_ORDER, riskColor, shortSegment } from "../lib/theme.js";
import {
  ChartPanel,
  DataTable,
  ErrorNote,
  Loading,
  Note,
  PageHeader,
  Panel,
  RiskBadge,
  RiskIcon,
  Segmented,
  SegmentTag,
  Select,
  TipBox,
} from "../components/ui.jsx";
import CustomerProfile from "./CustomerProfile.jsx";

const PAGE_SIZE = 12;

function snapshotOptionLabel(snapshot) {
  return snapshot.outcome_known
    ? `${snapshot.label}, held-out test (outcome known)`
    : `${snapshot.label}, end of data (outcome not recorded)`;
}

function bandRange(band) {
  if (band.max >= 1) return `${percent(band.min)} and above`;
  if (band.min <= 0) return `Below ${percent(band.max)}`;
  return `${percent(band.min)} to ${percent(band.max)}`;
}

function RiskBands({ summary, refreshing }) {
  const known = summary.snapshot.outcome_known;
  const evaluation = summary.evaluation;
  const windowText = `${dateLabel(summary.snapshot.cutoff)} to ${dateLabel(dayBefore(summary.snapshot.window_end))}`;

  const columns = [
    { key: "level", label: "Band", render: (row) => <RiskBadge level={row.level} /> },
    { key: "range", label: "Score", render: bandRange },
    {
      key: "customers",
      label: "Customers",
      align: "right",
      render: (row) => (
        <>
          {number(row.customers)} <span className="text-ink-2">({percent(row.share)})</span>
        </>
      ),
    },
    { key: "total_spend", label: "Spend to date", align: "right", render: (row) => gbpCompact(row.total_spend) },
    {
      key: "mean_probability",
      label: "Average score",
      align: "right",
      render: (row) => percent(row.mean_probability),
    },
  ];
  if (known) {
    columns.push({
      key: "actual_non_return_rate",
      label: "Did not return",
      align: "right",
      render: (row) => <span className="font-semibold">{percent(row.actual_non_return_rate)}</span>,
    });
  }

  return (
    <Panel
      title={`${number(summary.customers)} customers scored`}
      subtitle={`Chance of no purchase in the ${summary.horizon_days} days from ${windowText}`}
      refreshing={refreshing}
    >
      <div className="flex h-[14px] gap-[2px]" role="img" aria-label="Customers by risk band">
        {summary.bands.map((band) => (
          <div
            key={band.level}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${band.share * 100}%`, background: riskColor(band.level) }}
            title={`${band.level}: ${number(band.customers)} customers`}
          />
        ))}
      </div>

      <div className="mt-3">
        <DataTable caption="Customers by risk band" columns={columns} rows={summary.bands} rowKey={(row) => row.level} />
      </div>

      {known && evaluation ? (
        <div className="mt-4 border-t border-line pt-3">
          <Note>
            The last column is what customers went on to do, which the model never saw. Across all{" "}
            {number(evaluation.customers)} customers {percent(evaluation.base_rate)} did not return.
          </Note>
          <dl className="m-0 mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
            {[
              { label: "ROC-AUC", value: evaluation.roc_auc.toFixed(3) },
              { label: "Brier score", value: evaluation.brier_calibrated.toFixed(3) },
              { label: "Accuracy", value: percent(evaluation.accuracy, 1) },
              { label: "Precision", value: percent(evaluation.precision, 1) },
              { label: "Recall", value: percent(evaluation.recall, 1) },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[12px] text-ink-2">{item.label}</dt>
                <dd className="m-0 text-[17px] font-semibold tracking-[-0.01em]">{item.value}</dd>
              </div>
            ))}
          </dl>
          <Note className="mt-2">
            Accuracy, precision and recall use the {evaluation.threshold_raw.toFixed(2)} cut-off on the uncalibrated
            score that was chosen on April 2011 data. Brier score was {evaluation.brier_raw.toFixed(3)} before
            calibration.
          </Note>
        </div>
      ) : (
        <Note className="mt-4 border-t border-line pt-3">
          The data ends on {dateLabel(dayBefore(summary.snapshot.cutoff))}, so nobody recorded what these customers did
          next and these scores can't be checked. Switch the snapshot to the held-out test to see how the model's
          scores compared with what happened.
        </Note>
      )}
    </Panel>
  );
}

function HistogramTip({ active, payload, known }) {
  if (!active || !payload?.length) return null;
  const bin = payload[0].payload;
  const rows = [{ label: "Customers", value: number(bin.customers) }];
  if (known && bin.actual_non_return_rate != null) {
    rows.push({ label: "Did not return", value: percent(bin.actual_non_return_rate) });
  }
  return (
    <TipBox
      title={`Score ${percent(bin.bin_start)} to ${percent(bin.bin_end)} (${bin.level.toLowerCase()} risk)`}
      rows={rows}
    />
  );
}

function ScoreHistogram({ summary, refreshing }) {
  const known = summary.snapshot.outcome_known;
  const rows = summary.histogram.map((bin) => ({ ...bin, key: bin.bin_start.toFixed(2) }));
  const columns = [
    { key: "range", label: "Score", render: (row) => `${percent(row.bin_start)} to ${percent(row.bin_end)}` },
    { key: "level", label: "Band", render: (row) => <RiskBadge level={row.level} suffix="" /> },
    { key: "customers", label: "Customers", align: "right", render: (row) => number(row.customers) },
  ];
  if (known) {
    columns.push({
      key: "actual_non_return_rate",
      label: "Did not return",
      align: "right",
      render: (row) => percent(row.actual_non_return_rate),
    });
  }

  return (
    <ChartPanel
      title="How the scores are spread"
      subtitle="Customers in each five-point score range"
      refreshing={refreshing}
      table={{ caption: "Score distribution", columns, rows, rowKey: (row) => row.key }}
    >
      <ul className="m-0 mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-ink-2">
        {[...RISK_LEVELS].reverse().map((level) => (
          <li key={level} className="inline-flex items-center gap-1.5">
            <RiskIcon level={level} size={12} />
            {level} risk
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={236}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="key"
            tickFormatter={(value) => percent(Number(value))}
            interval={3}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} width={44} tickCount={5} tickFormatter={number} />
          <Tooltip
            content={<HistogramTip known={known} />}
            cursor={{ fill: "var(--sunken)" }}
            isAnimationActive={false}
          />
          <Bar dataKey="customers" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={riskColor(row.level)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}

function CustomerFinder({ meta, snapshot, selected, onSelect }) {
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [segment, setSegment] = useState("");
  const [sort, setSort] = useState("probability:desc");
  const [page, setPage] = useState(1);

  // Wait for a pause in typing before asking the backend.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => setPage(1), [search, risk, segment, sort, snapshot]);

  const [sortKey, order] = sort.split(":");
  const { data, error, loading, refreshing } = useApi("/customers", {
    snapshot,
    search,
    risk,
    segment,
    sort: sortKey,
    order,
    page,
    page_size: PAGE_SIZE,
  });

  // Open the first customer in the list when nothing is selected yet.
  const first = data?.customers?.[0]?.customer_id;
  useEffect(() => {
    if (!selected && first) onSelect(first, { replace: true });
  }, [selected, first, onSelect]);

  const segmentOptions = [
    { value: "", label: "All segments" },
    ...SEGMENT_ORDER.map((cluster) => {
      const item = meta.segments.find((entry) => entry.cluster === cluster);
      return { value: String(cluster), label: shortSegment(item?.name) };
    }),
  ];

  const from = data ? (data.page - 1) * data.page_size + 1 : 0;
  const to = data ? Math.min(data.page * data.page_size, data.total) : 0;

  return (
    <Panel title="Find a customer" className="xl:sticky xl:top-6 xl:self-start">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="customer-search" className="text-[12px] font-medium text-ink-2">
            Customer ID
          </label>
          <input
            id="customer-search"
            type="search"
            inputMode="numeric"
            placeholder="Start typing an ID, for example 12347"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-9 rounded-md border-0 bg-surface px-3 text-[14px] text-ink ring-1 ring-line placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-2">Risk band</span>
          <Segmented
            label="Risk band"
            value={risk}
            onChange={setRisk}
            options={[{ value: "", label: "All" }, ...RISK_LEVELS.map((level) => ({ value: level, label: level }))]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Segment" value={segment} onChange={setSegment} options={segmentOptions} />
          <Select
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              { value: "probability:desc", label: "Highest risk" },
              { value: "probability:asc", label: "Lowest risk" },
              { value: "monetary:desc", label: "Highest spend" },
              { value: "recency:asc", label: "Most recent purchase" },
              { value: "customer_id:asc", label: "Customer ID" },
            ]}
          />
        </div>
      </div>

      <div className={`mt-4 transition-opacity ${refreshing ? "opacity-50" : ""}`}>
        {loading && <Loading />}
        {error && <ErrorNote error={error} />}
        {data && data.total === 0 && (
          <Note className="py-6">
            No customers match. {search ? `Nothing scored at this snapshot has an ID starting with ${search}. ` : ""}
            Clear a filter to widen the list.
          </Note>
        )}
        {data && data.total > 0 && (
          <>
            <ul className="m-0 list-none border-t border-line p-0">
              {data.customers.map((customer) => {
                const active = customer.customer_id === selected;
                return (
                  <li key={customer.customer_id} className="border-b border-line">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onSelect(customer.customer_id)}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2 text-left ${
                        active ? "bg-accent-wash" : "hover:bg-sunken"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold">{customer.customer_id}</span>
                        <span className="block truncate text-[12.5px] text-ink-2">
                          <SegmentTag cluster={customer.cluster} name={customer.segment} />
                          <span className="ml-2">{gbpCompact(customer.monetary)}</span>
                        </span>
                      </span>
                      <span className="tabular inline-flex items-center gap-2 text-[14px] font-semibold">
                        {percent(customer.probability)}
                        <RiskIcon level={customer.risk_level} />
                        <span className="sr-only">{customer.risk_level} risk</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-ink-2">
              <span className="tabular">
                {number(from)} to {number(to)} of {number(data.total)}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
                  className="rounded-md px-2.5 py-1 font-medium text-ink ring-1 ring-line enabled:hover:bg-sunken disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.pages}
                  onClick={() => setPage(data.page + 1)}
                  className="rounded-md px-2.5 py-1 font-medium text-ink ring-1 ring-line enabled:hover:bg-sunken disabled:opacity-40"
                >
                  Next
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

export default function Churn({ meta }) {
  const [params, setParams] = useSearchParams();
  const known = meta.snapshots.map((item) => item.id);
  const snapshot = known.includes(params.get("snapshot")) ? params.get("snapshot") : meta.default_snapshot;
  const customer = params.get("customer") || "";

  const update = (changes, options) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next, options);
  };

  const { data: summary, error, loading, refreshing } = useApi("/churn/summary", { snapshot });
  const current = meta.snapshots.find((item) => item.id === snapshot);
  const model = meta.churn_model;

  return (
    <>
      <PageHeader
        title="Churn prediction"
        description={`A calibrated CatBoost model estimates each customer's chance of making no purchase in the next ${model.horizon_days} days, using only what they had bought before the snapshot date.`}
      >
        <Select
          label="Snapshot date"
          value={snapshot}
          onChange={(value) => update({ snapshot: value })}
          options={meta.snapshots.map((item) => ({ value: item.id, label: snapshotOptionLabel(item) }))}
        />
        <Note className="max-w-[62ch] pb-1.5">
          {current?.outcome_known
            ? `The model learned from ${model.training_snapshots.map(dateLabel).join(" and ")} and was calibrated on ${dateLabel(
                model.calibration_snapshot
              )}. This date came later, so it is a fair test.`
            : "Scores use every purchase up to the last day of data. A high score is an estimate from past behaviour, not proof a customer has left for good."}
        </Note>
      </PageHeader>

      {loading && <Loading label="Scoring customers" />}
      {error && <ErrorNote error={error} />}

      {summary && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <RiskBands summary={summary} refreshing={refreshing} />
            <ScoreHistogram summary={summary} refreshing={refreshing} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <CustomerFinder
              meta={meta}
              snapshot={snapshot}
              selected={customer}
              onSelect={(id, options) => update({ customer: id }, options)}
            />
            <CustomerProfile snapshot={snapshot} customerId={customer} />
          </div>
        </div>
      )}
    </>
  );
}
