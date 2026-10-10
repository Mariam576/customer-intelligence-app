import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../lib/api.js";
import { days, gbp, gbpAxis, gbpCompact, number, percent } from "../lib/format.js";
import { SEGMENT_ORDER, segmentColor, shortSegment } from "../lib/theme.js";
import {
  DataTable,
  ErrorNote,
  Legend,
  Loading,
  Note,
  PageHeader,
  Panel,
  RiskBadge,
  SegmentTag,
  TipBox,
} from "../components/ui.jsx";

function ordered(segments) {
  return SEGMENT_ORDER.map((cluster) => segments.find((item) => item.cluster === cluster)).filter(Boolean);
}

function SegmentPicker({ segments, selected, onSelect }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
      {segments.map((segment) => {
        const active = segment.cluster === selected;
        return (
          <button
            key={segment.cluster}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(segment.cluster)}
            className={`relative flex flex-col items-start px-5 pb-4 pt-5 text-left transition-colors ${
              active ? "bg-surface" : "bg-sunken hover:bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[4px]"
              style={{ background: segmentColor(segment.cluster), opacity: active ? 1 : 0.35 }}
            />
            <span className="text-[14px] font-semibold">
              <SegmentTag cluster={segment.cluster} name={segment.name} />
            </span>
            <span className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.02em]">
              {number(segment.customers)}
            </span>
            <span className="mt-1 text-[12.5px] text-ink-2">
              customers, {percent(segment.customer_share, 1)} of the base
            </span>
            <span className="mt-3 text-[12.5px] leading-snug text-ink-2">
              Typically last bought {days(segment.median_recency_days)} ago, with{" "}
              {number(segment.median_frequency)} {segment.median_frequency === 1 ? "invoice" : "invoices"} and{" "}
              {gbp(segment.median_monetary)} spent.
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Two bars per segment: how many customers it holds vs how much they spend. */
function ShareBars({ segments }) {
  const top = Math.max(...segments.flatMap((item) => [item.customer_share, item.spend_share]));
  const bar = (share, color, opacity) => (
    <div className="flex items-center gap-2">
      <div
        className="h-[12px] rounded-r-[4px]"
        style={{ width: `calc((100% - 3.5rem) * ${share / top})`, minWidth: 2, background: color, opacity }}
      />
      <span className="tabular text-[12.5px] font-medium">{percent(share, 1)}</span>
    </div>
  );
  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "Share of customers", color: "var(--ink-3)", opacity: 0.4 },
            { label: "Share of spend", color: "var(--ink-3)" },
          ]}
        />
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {segments.map((segment) => (
          <li key={segment.cluster} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-x-3">
            <span className="truncate text-[13px]">{shortSegment(segment.name)}</span>
            <div className="flex flex-col gap-[2px]">
              {bar(segment.customer_share, segmentColor(segment.cluster), 0.4)}
              {bar(segment.spend_share, segmentColor(segment.cluster), 1)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PointTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TipBox
      title={`Customer ${point.customer_id}`}
      rows={[
        { label: "Total spend", value: gbp(point.monetary) },
        { label: "Last purchase", value: `${days(point.recency_days)} ago` },
        { label: "Invoices", value: number(point.frequency) },
      ]}
    />
  );
}

const SPEND_TICKS = [10, 100, 1000, 10000, 100000];

function SegmentMap({ segments, scatter, selected, onSelect, maxRecency }) {
  const navigate = useNavigate();
  const byCluster = useMemo(() => {
    const groups = {};
    scatter.forEach((point) => {
      (groups[point.cluster] ||= []).push({ ...point, monetary: Math.max(point.monetary, 1) });
    });
    return groups;
  }, [scatter]);

  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
      {segments.map((segment, index) => (
        <figure key={segment.cluster} className="m-0 min-w-0">
          <figcaption className="mb-1 flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={() => onSelect(segment.cluster)}
              className={`rounded-[4px] font-medium ${segment.cluster === selected ? "text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              <SegmentTag cluster={segment.cluster} name={segment.name} />
            </button>
          </figcaption>
          <ResponsiveContainer width="100%" height={210}>
            <ScatterChart margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis
                type="number"
                dataKey="recency_days"
                domain={[0, maxRecency]}
                ticks={[0, 200, 400, 600]}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                tickMargin={6}
              />
              <YAxis
                type="number"
                dataKey="monetary"
                scale="log"
                domain={[1, 1000000]}
                ticks={SPEND_TICKS}
                tickFormatter={gbpAxis}
                tickLine={false}
                axisLine={false}
                width={index % 4 === 0 ? 46 : 46}
                allowDataOverflow
              />
              <Tooltip content={<PointTip />} cursor={false} isAnimationActive={false} />
              <Scatter
                data={byCluster[segment.cluster] || []}
                fill={segmentColor(segment.cluster)}
                fillOpacity={0.55}
                isAnimationActive={false}
                shape={(props) => <circle cx={props.cx} cy={props.cy} r={3} fill={props.fill} fillOpacity={0.55} />}
                activeShape={(props) => (
                  <circle cx={props.cx} cy={props.cy} r={5} fill={props.fill} stroke="var(--surface)" strokeWidth={2} />
                )}
                onClick={(point) => navigate(`/churn?snapshot=latest&customer=${point.customer_id}`)}
                cursor="pointer"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </figure>
      ))}
    </div>
  );
}

function SegmentCustomers({ segment }) {
  const navigate = useNavigate();
  const { data, error, loading, refreshing } = useApi("/customers", {
    snapshot: "latest",
    segment: segment.cluster,
    sort: "monetary",
    order: "desc",
    page_size: 10,
  });

  return (
    <Panel
      title={`Biggest spenders in ${shortSegment(segment.name)}`}
      subtitle="Select a customer to open their purchase history and churn score"
      refreshing={refreshing}
    >
      {loading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && (
        <DataTable
          caption={`Top customers in ${segment.name}`}
          rowKey={(row) => row.customer_id}
          onRowClick={(row) => navigate(`/churn?snapshot=latest&customer=${row.customer_id}`)}
          columns={[
            {
              key: "customer_id",
              label: "Customer",
              render: (row) => (
                <button
                  type="button"
                  className="font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/churn?snapshot=latest&customer=${row.customer_id}`);
                  }}
                >
                  {row.customer_id}
                </button>
              ),
            },
            { key: "country", label: "Country" },
            { key: "monetary", label: "Total spend", align: "right", render: (row) => gbp(row.monetary) },
            { key: "frequency", label: "Invoices", align: "right", render: (row) => number(row.frequency) },
            {
              key: "recency_days",
              label: "Last purchase",
              align: "right",
              render: (row) => `${days(row.recency_days)} ago`,
            },
            {
              key: "probability",
              label: "90-day non-return risk",
              align: "right",
              render: (row) => (
                <span className="inline-flex items-center justify-end gap-2">
                  {percent(row.probability)}
                  <RiskBadge level={row.risk_level} suffix="" />
                </span>
              ),
            },
          ]}
          rows={data.customers}
        />
      )}
    </Panel>
  );
}

export default function Segments() {
  const { data, error, loading } = useApi("/segments");
  const [selected, setSelected] = useState(SEGMENT_ORDER[0]);

  if (loading) return <Loading label="Loading segments" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const segments = ordered(data.segments);
  const current = segments.find((item) => item.cluster === selected) || segments[0];
  const lead = segments[0];
  const maxRecency = Math.ceil(Math.max(...data.scatter.map((point) => point.recency_days)) / 50) * 50;

  return (
    <>
      <PageHeader
        title="Customer segments"
        description={`K-Means groups the ${number(data.customers)} identified customers into four types using three things: how recently they bought, how many invoices they have, and how much they spent. Measured at the end of the data, ${data.reference_label}.`}
      />

      <div className="flex flex-col gap-4">
        <SegmentPicker segments={segments} selected={current.cluster} onSelect={setSelected} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Panel
            title="Who brings in the money"
            subtitle={`${shortSegment(lead.name)} is ${percent(lead.customer_share, 0)} of customers and ${percent(
              lead.spend_share,
              0
            )} of spend`}
          >
            <ShareBars segments={segments} />
          </Panel>

          <Panel title="Segment profile" subtitle="Median customer in each segment, and where the churn model puts them">
            <DataTable
              caption="Segment profile"
              rowKey={(row) => row.cluster}
              selectedKey={current.cluster}
              onRowClick={(row) => setSelected(row.cluster)}
              columns={[
                {
                  key: "name",
                  label: "Segment",
                  render: (row) => <SegmentTag cluster={row.cluster} name={row.name} />,
                },
                {
                  key: "median_recency_days",
                  label: "Last purchase",
                  align: "right",
                  render: (row) => `${days(row.median_recency_days)} ago`,
                },
                { key: "median_frequency", label: "Invoices", align: "right", render: (row) => number(row.median_frequency) },
                { key: "median_monetary", label: "Spend", align: "right", render: (row) => gbp(row.median_monetary) },
                { key: "total_spend", label: "Segment total", align: "right", render: (row) => gbpCompact(row.total_spend) },
                {
                  key: "mean_probability",
                  label: "Average non-return risk",
                  align: "right",
                  render: (row) => percent(row.mean_probability),
                },
              ]}
              rows={segments}
            />
            <Note className="mt-3">
              Non-return risk is the calibrated CatBoost probability of no purchase in the 90 days after{" "}
              {data.reference_label}, averaged over the segment.
            </Note>
          </Panel>
        </div>

        <Panel
          title="Where each segment sits"
          subtitle={`Days since last purchase (across) against total spend (up, each gridline is ten times the one below). A sample of up to ${data.scatter_points_per_segment} customers per segment.`}
        >
          <SegmentMap
            segments={segments}
            scatter={data.scatter}
            selected={current.cluster}
            onSelect={setSelected}
            maxRecency={maxRecency}
          />
        </Panel>

        <SegmentCustomers segment={current} />
      </div>
    </>
  );
}
