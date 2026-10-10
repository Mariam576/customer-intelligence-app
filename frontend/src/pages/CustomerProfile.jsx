import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../lib/api.js";
import {
  dateLabel,
  dayBefore,
  featureValue,
  gbp,
  gbpAxis,
  monthLabel,
  number,
  percent,
} from "../lib/format.js";
import { riskColor } from "../lib/theme.js";
import {
  DataTable,
  ErrorNote,
  Legend,
  Loading,
  Note,
  Panel,
  RiskBadge,
  RiskIcon,
  SegmentTag,
  TipBox,
} from "../components/ui.jsx";

const INVOICES_SHOWN = 8;

/** "Regency Cakestand 3 Tier" from the upper-case catalogue name. */
function productName(raw) {
  return (raw || "")
    .toLowerCase()
    .replace(/\s+,/g, ",")
    .replace(/(^|[\s/(-])([a-z])/g, (match, lead, letter) => lead + letter.toUpperCase());
}

function RiskMeter({ churn, bands }) {
  const color = riskColor(churn.risk_level);
  const thresholds = bands.filter((band) => band.min > 0).sort((a, b) => a.min - b.min);
  return (
    <div>
      <div
        className="relative h-[12px] rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}
        role="img"
        aria-label={`Score ${percent(churn.probability)}, ${churn.risk_level} risk`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(churn.probability * 100, 1.5)}%`, background: color }}
        />
        {thresholds.map((band) => (
          <span
            key={band.level}
            aria-hidden="true"
            className="absolute -bottom-[5px] -top-[5px] w-[2px] bg-surface"
            style={{ left: `calc(${band.min * 100}% - 1px)` }}
          />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[12px] text-ink-3">
        <span className="absolute left-0">0%</span>
        {thresholds.map((band) => (
          <span key={band.level} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${band.min * 100}%` }}>
            {band.level} from {percent(band.min)}
          </span>
        ))}
        <span className="absolute right-0">100%</span>
      </div>
    </div>
  );
}

function Outcome({ profile }) {
  const { outcome, churn } = profile;
  const windowText = `${dateLabel(outcome.window_start)} and ${dateLabel(dayBefore(outcome.window_end))}`;
  return (
    <div className="rounded-md bg-sunken px-4 py-3 ring-1 ring-line">
      <div className="text-[13px] font-semibold">What happened next</div>
      <p className="m-0 mt-1 text-[14px]">
        {outcome.returned
          ? `Came back on ${dateLabel(outcome.first_purchase_date)}: ${number(outcome.invoices)} ${
              outcome.invoices === 1 ? "invoice" : "invoices"
            } worth ${gbp(outcome.spend, { pence: true })} between ${windowText}.`
          : `No purchase between ${windowText}.`}
      </p>
      <Note className="mt-1">
        The model scored this customer {percent(churn.probability)} without seeing this period.
      </Note>
    </div>
  );
}

/** Diverging bars: left lowers the risk, right raises it. */
function Drivers({ drivers }) {
  const top = Math.max(...drivers.map((driver) => Math.abs(driver.contribution)), 1e-9);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={[
            { label: "Lowers the risk", color: "var(--lower)" },
            { label: "Raises the risk", color: "var(--raise)" },
          ]}
        />
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {drivers.map((driver) => {
          const share = (Math.abs(driver.contribution) / top) * 50;
          const raises = driver.contribution > 0;
          return (
            <li
              key={driver.feature}
              className="grid grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] items-center gap-x-3 py-[6px]"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px]">{driver.label}</div>
                <div className="tabular text-[12px] text-ink-3">{featureValue(driver.feature, driver.value)}</div>
              </div>
              <div
                className="relative h-[14px]"
                role="img"
                aria-label={`${driver.label}: ${raises ? "raises" : "lowers"} the risk`}
              >
                <span aria-hidden="true" className="absolute inset-y-[-4px] left-1/2 w-px bg-axis" />
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 ${raises ? "rounded-r-[4px]" : "rounded-l-[4px]"}`}
                  style={{
                    width: `max(${share}%, 2px)`,
                    left: raises ? "50%" : undefined,
                    right: raises ? undefined : "50%",
                    background: raises ? "var(--raise)" : "var(--lower)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <Note className="mt-2">
        Bar length shows how strongly each input moved this customer's score compared with a typical customer
        (CatBoost SHAP values, strongest first).
      </Note>
    </div>
  );
}

function HistoryTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TipBox
      title={monthLabel(row.month)}
      rows={[
        { label: "Spend", value: gbp(row.spend, { pence: true }) },
        { label: "Invoices", value: number(row.invoices) },
      ]}
    />
  );
}

function PurchaseHistory({ profile }) {
  const [showAll, setShowAll] = useState(false);
  const { monthly, invoices, top_products: topProducts } = profile.history;
  const ticks = monthly.filter((row) => Number(row.month.slice(5)) % 3 === 0).map((row) => row.month);
  const visible = showAll ? invoices : invoices.slice(0, INVOICES_SHOWN);

  return (
    <Panel
      title="Purchase history"
      subtitle={`${number(invoices.length)} ${invoices.length === 1 ? "invoice" : "invoices"} before ${
        profile.snapshot.label
      }, the only history the model was given`}
    >
      <div className="mb-1 text-[12.5px] text-ink-2">Spend per month</div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={monthly} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="month"
            ticks={ticks}
            interval={0}
            tickFormatter={(month) => monthLabel(month, { short: true })}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            tickMargin={8}
          />
          <YAxis tickFormatter={gbpAxis} tickLine={false} axisLine={false} width={52} tickCount={4} />
          <Tooltip content={<HistoryTip />} cursor={{ fill: "var(--sunken)" }} isAnimationActive={false} />
          <Bar dataKey="spend" fill="var(--s1)" maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-5 grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div>
          <div className="mb-1 text-[13px] font-semibold">Invoices, newest first</div>
          <DataTable
            caption="Invoices"
            rowKey={(row) => row.invoice_id}
            columns={[
              { key: "date", label: "Date", render: (row) => dateLabel(row.date) },
              { key: "invoice_id", label: "Invoice" },
              { key: "lines", label: "Lines", align: "right", render: (row) => number(row.lines) },
              { key: "units", label: "Units", align: "right", render: (row) => number(row.units) },
              { key: "value", label: "Value", align: "right", render: (row) => gbp(row.value, { pence: true }) },
            ]}
            rows={visible}
          />
          {invoices.length > INVOICES_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-[13px] font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current"
            >
              {showAll ? `Show the latest ${INVOICES_SHOWN} only` : `Show all ${number(invoices.length)} invoices`}
            </button>
          )}
        </div>
        <div>
          <div className="mb-1 text-[13px] font-semibold">Products they spent most on</div>
          <DataTable
            caption="Top products"
            rowKey={(row) => row.code}
            columns={[
              { key: "name", label: "Product", render: (row) => productName(row.name), wrap: true },
              { key: "units", label: "Units", align: "right", render: (row) => number(row.units) },
              { key: "spend", label: "Spend", align: "right", render: (row) => gbp(row.spend) },
            ]}
            rows={topProducts}
          />
        </div>
      </div>
    </Panel>
  );
}

export default function CustomerProfile({ snapshot, customerId }) {
  const { data: profile, error, loading, refreshing } = useApi(customerId ? `/customers/${customerId}` : null, {
    snapshot,
  });
  const { data: summary } = useApi("/churn/summary", { snapshot });

  if (!customerId) {
    return (
      <Panel>
        <Note className="py-8">Choose a customer from the list to see their purchase history, segment and score.</Note>
      </Panel>
    );
  }
  if (loading) {
    return (
      <Panel>
        <Loading label={`Loading customer ${customerId}`} />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title={`Customer ${customerId}`}>
        <ErrorNote error={error} />
      </Panel>
    );
  }
  if (!profile) return null;

  const { churn, segment } = profile;
  const bands = summary?.bands || [];

  return (
    <div className={`flex min-w-0 flex-col gap-4 transition-opacity ${refreshing ? "opacity-50" : ""}`}>
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-1">
          <h2 className="m-0 text-[20px] font-semibold">Customer {profile.customer_id}</h2>
          <div className="text-[13px] text-ink-2">
            {profile.country}, first bought {dateLabel(profile.first_purchase)}
          </div>
        </div>

        <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div>
            <div className="flex items-end gap-4">
              <div className="text-[64px] font-semibold leading-[0.9] tracking-[-0.035em]">
                {percent(churn.probability)}
              </div>
              <div className="pb-1">
                <div className="text-[15px] font-semibold">
                  <RiskBadge level={churn.risk_level} />
                </div>
                <div className="text-[12.5px] text-ink-2">
                  Ranked {number(churn.rank)} of {number(churn.out_of)} by risk
                </div>
              </div>
            </div>
            <p className="m-0 mb-4 mt-3 max-w-[46ch] text-[14px] text-ink-2">
              Estimated chance of no purchase in the {churn.horizon_days} days after {profile.snapshot.label}.
            </p>
            <RiskMeter churn={churn} bands={bands} />
            <Note className="mt-5">
              CatBoost's own score was {percent(churn.raw_probability, 1)}. Calibration moved it to{" "}
              {percent(churn.probability, 1)} so that, across customers, the percentage matches how often people
              really did not return.
            </Note>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[12.5px] text-ink-2">Segment on {profile.snapshot.label}</div>
              <div className="mt-0.5 text-[16px] font-semibold">
                <SegmentTag cluster={segment.cluster} name={segment.name} short={false} />
              </div>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-3">
              {profile.features.map((item) => (
                <div key={item.feature}>
                  <dt className="text-[12.5px] text-ink-2">{item.label}</dt>
                  <dd className="tabular m-0 text-[15px] font-semibold">{featureValue(item.feature, item.value).replace(
                    / (invoices?|months?|units|products?)$/,
                    ""
                  )}</dd>
                </div>
              ))}
            </dl>
            <Note>These eight numbers are everything the churn model is given.</Note>
          </div>
        </div>

        {profile.outcome && (
          <div className="mt-5">
            <Outcome profile={profile} />
          </div>
        )}
      </Panel>

      <Panel title="What is driving this score">
        <Drivers drivers={profile.drivers} />
      </Panel>

      <PurchaseHistory profile={profile} />
    </div>
  );
}
