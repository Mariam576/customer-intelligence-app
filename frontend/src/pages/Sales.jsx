import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "../lib/api.js";
import {
  dateLabel,
  gbp,
  gbpAxis,
  gbpCompact,
  monthLabel,
  monthName,
  number,
  numberCompact,
  percent,
} from "../lib/format.js";
import {
  BarList,
  ChartPanel,
  ErrorNote,
  Field,
  Loading,
  Note,
  PageHeader,
  Panel,
  Segmented,
  TipBox,
} from "../components/ui.jsx";

const HOME_MARKET = "United Kingdom";
const OTHER_MARKETS_SHOWN = 10;

/** "REGENCY CAKESTAND 3 TIER" -> "Regency Cakestand 3 Tier" */
function productName(raw) {
  return (raw || "")
    .toLowerCase()
    .replace(/\s+,/g, ",")
    .replace(/(^|[\s/(-])([a-z])/g, (match, lead, letter) => lead + letter.toUpperCase());
}

function KpiBand({ kpis, range }) {
  const items = [
    { label: "Invoices", value: number(kpis.invoices) },
    { label: "Average invoice", value: gbp(kpis.avg_invoice_value) },
    { label: "Units sold", value: numberCompact(kpis.units) },
    { label: "Identified customers", value: number(kpis.identified_customers) },
    { label: "Products sold", value: number(kpis.products) },
  ];
  return (
    <div className="grid gap-y-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,3fr)] lg:gap-x-8">
      <div>
        <div className="text-[13px] text-ink-2">Gross merchandise sales</div>
        <div className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.025em]">
          {gbpCompact(kpis.gross_sales)}
        </div>
        <div className="mt-2 text-[12.5px] text-ink-2">
          {dateLabel(range.start)} to {dateLabel(range.end)}
        </div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-y-4 sm:grid-cols-5 lg:border-l lg:border-line">
        {items.map((item) => (
          <div key={item.label} className="border-line sm:border-l sm:pl-4 sm:first:border-l-0 lg:first:border-l-0 lg:pl-5">
            <dt className="text-[12.5px] text-ink-2">{item.label}</dt>
            <dd className="m-0 mt-1 text-[22px] font-semibold leading-tight tracking-[-0.015em]">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MonthTip({ active, label, rows }) {
  if (!active || !label) return null;
  const row = rows.find((item) => item.month === label);
  if (!row) return null;
  return (
    <TipBox
      title={monthLabel(row.month)}
      rows={[
        { label: "Gross sales", value: gbp(row.gross_sales) },
        { label: "Invoices", value: number(row.invoices) },
        { label: "Average invoice", value: gbp(row.avg_invoice_value) },
      ]}
      note={row.partial ? `Only ${row.days_covered} of ${row.days_in_month} days are in the data.` : null}
    />
  );
}

function MonthlyTrend({ monthly }) {
  // The partial month is drawn as a hollow point, not joined to the line,
  // so nine days of December don't read as a collapse in sales.
  const rows = monthly.map((row) => ({ ...row, complete: row.partial ? null : row.gross_sales }));
  const complete = rows.filter((row) => !row.partial);
  const peak = complete.reduce((best, row) => (row.gross_sales > best.gross_sales ? row : best), complete[0]);
  const partial = rows.filter((row) => row.partial);
  const manyMonths = rows.length > 14;
  const ticks = manyMonths
    ? rows.filter((row) => Number(row.month.slice(5)) % 3 === 0).map((row) => row.month)
    : rows.map((row) => row.month);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} margin={{ top: 26, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis
          dataKey="month"
          ticks={ticks}
          tickFormatter={(month) => (manyMonths ? monthLabel(month, { short: true }) : monthName(month))}
          tickLine={false}
          axisLine={{ stroke: "var(--axis)" }}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis tickFormatter={gbpAxis} tickLine={false} axisLine={false} width={58} tickCount={5} />
        <Tooltip
          content={<MonthTip rows={rows} />}
          cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {/* Invisible series so the tooltip also works on the partial month. */}
        <Area
          dataKey="gross_sales"
          stroke="none"
          fill="none"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          legendType="none"
        />
        <Area
          type="linear"
          dataKey="complete"
          stroke="var(--s1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="var(--s1)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4.5, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {peak && (
          <ReferenceDot
            x={peak.month}
            y={peak.gross_sales}
            r={4.5}
            fill="var(--s1)"
            stroke="var(--surface)"
            strokeWidth={2}
            label={({ viewBox }) => {
              // Keep the label inside the plot when the peak is near an edge.
              const position = rows.indexOf(peak) / Math.max(rows.length - 1, 1);
              const anchor = position > 0.75 ? "end" : position < 0.25 ? "start" : "middle";
              const nudge = anchor === "end" ? 6 : anchor === "start" ? -6 : 0;
              return (
                <text
                  x={viewBox.x + viewBox.width / 2 + nudge}
                  y={viewBox.y - 8}
                  textAnchor={anchor}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--ink)"
                >
                  {gbpCompact(peak.gross_sales)} in {monthLabel(peak.month)}
                </text>
              );
            }}
          />
        )}
        {partial.map((row) => (
          <ReferenceDot
            key={row.month}
            x={row.month}
            y={row.gross_sales}
            r={4.5}
            fill="var(--surface)"
            stroke="var(--s1)"
            strokeWidth={2}
            label={({ viewBox }) => (
              <text
                x={viewBox.x + viewBox.width / 2 - 10}
                y={viewBox.y + viewBox.height / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--ink-2)"
                className="hidden sm:block"
              >
                {row.days_covered} days of {monthName(row.month)} only
              </text>
            )}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TopProducts({ products, refreshing }) {
  const [measure, setMeasure] = useState("sales");
  const list = measure === "sales" ? products.by_sales : products.by_units;
  const rows = list.map((item) => ({
    key: item.code,
    label: productName(item.name),
    sublabel: `${number(item.invoices)} ${item.invoices === 1 ? "invoice" : "invoices"} (code ${item.code})`,
    value: measure === "sales" ? item.gross_sales : item.units,
    display: measure === "sales" ? gbpCompact(item.gross_sales) : number(item.units),
  }));

  return (
    <ChartPanel
      title="Top-selling products"
      subtitle={measure === "sales" ? "Ten products with the highest sales value" : "Ten products with the most units sold"}
      refreshing={refreshing}
      actions={
        <Segmented
          label="Rank products by"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "sales", label: "By sales" },
            { value: "units", label: "By units" },
          ]}
        />
      }
      table={{
        caption: "Top-selling products",
        columns: [
          { key: "name", label: "Product", render: (row) => productName(row.name), wrap: true },
          { key: "code", label: "Code" },
          { key: "gross_sales", label: "Sales", align: "right", render: (row) => gbp(row.gross_sales) },
          { key: "units", label: "Units", align: "right", render: (row) => number(row.units) },
          { key: "invoices", label: "Invoices", align: "right", render: (row) => number(row.invoices) },
        ],
        rows: list,
      }}
    >
      <BarList rows={rows} />
    </ChartPanel>
  );
}

function Countries({ countries, refreshing }) {
  const home = countries.find((item) => item.country === HOME_MARKET);
  const others = countries.filter((item) => item.country !== HOME_MARKET);
  const shown = others.slice(0, OTHER_MARKETS_SHOWN);
  const rest = others.slice(OTHER_MARKETS_SHOWN);
  const restSales = rest.reduce((sum, item) => sum + item.gross_sales, 0);

  const rows = shown.map((item) => ({
    key: item.country,
    label: item.country === "EIRE" ? "Ireland (EIRE)" : item.country,
    value: item.gross_sales,
    display: (
      <>
        {gbpCompact(item.gross_sales)} <span className="ml-1 font-normal text-ink-2">{percent(item.share, 1)}</span>
      </>
    ),
  }));

  return (
    <ChartPanel
      title="Sales by country"
      subtitle={`${countries.length} countries by delivery address`}
      refreshing={refreshing}
      table={{
        caption: "Sales by country",
        columns: [
          { key: "country", label: "Country" },
          { key: "gross_sales", label: "Sales", align: "right", render: (row) => gbp(row.gross_sales) },
          { key: "share", label: "Share", align: "right", render: (row) => percent(row.share, 2) },
          { key: "invoices", label: "Invoices", align: "right", render: (row) => number(row.invoices) },
          { key: "customers", label: "Customers", align: "right", render: (row) => number(row.customers) },
        ],
        rows: countries,
      }}
    >
      {home && (
        <div className="mb-4 border-b border-line pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px]">{HOME_MARKET}</span>
            <span className="tabular text-[13px] font-medium">
              {gbpCompact(home.gross_sales)} <span className="ml-1 text-ink-2">{percent(home.share, 1)} of sales</span>
            </span>
          </div>
          <div
            className="mt-2 h-[10px] overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, var(--s1) 18%, transparent)" }}
            role="img"
            aria-label={`${HOME_MARKET}: ${percent(home.share, 1)} of sales`}
          >
            <div className="h-full rounded-full bg-s1" style={{ width: `${home.share * 100}%` }} />
          </div>
        </div>
      )}
      <div className="mb-1 text-[12.5px] text-ink-2">Largest markets outside the UK</div>
      <BarList rows={rows} labelWidth="minmax(0, min(8.5rem, 34%))" valueWidth="8.5rem" />
      {rest.length > 0 && (
        <Note className="mt-2">
          {rest.length} more countries add {gbpCompact(restSales)}. Switch to the table to see them all.
        </Note>
      )}
    </ChartPanel>
  );
}

export default function Sales({ meta }) {
  const [period, setPeriod] = useState("all");
  const { data, error, loading, refreshing } = useApi("/sales", { period });

  return (
    <>
      <PageHeader
        title="Sales"
        description="Positive merchandise sales only: returns, postage and other non-product lines were removed when the data was cleaned."
      >
        <Field label="Period">
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={meta.periods.map((item) => ({ value: item.id, label: item.label }))}
          />
        </Field>
      </PageHeader>

      {loading && <Loading label="Adding up sales" />}
      {error && <ErrorNote error={error} />}

      {data && (
        <div className="flex flex-col gap-4">
          <Panel refreshing={refreshing}>
            <div className="pt-2">
              <KpiBand kpis={data.kpis} range={data.date_range} />
            </div>
          </Panel>

          <ChartPanel
            title="Monthly sales"
            subtitle={
              data.monthly.some((row) => row.partial)
                ? `Gross merchandise sales per calendar month. The hollow point is ${data.monthly
                    .filter((row) => row.partial)
                    .map((row) => `${monthLabel(row.month)}, which has ${row.days_covered} days of data`)
                    .join("; ")}.`
                : "Gross merchandise sales per calendar month"
            }
            refreshing={refreshing}
            table={{
              caption: "Monthly sales",
              columns: [
                {
                  key: "month",
                  label: "Month",
                  render: (row) => `${monthLabel(row.month)}${row.partial ? ` (${row.days_covered} days)` : ""}`,
                },
                { key: "gross_sales", label: "Sales", align: "right", render: (row) => gbp(row.gross_sales) },
                { key: "invoices", label: "Invoices", align: "right", render: (row) => number(row.invoices) },
                { key: "units", label: "Units", align: "right", render: (row) => number(row.units) },
                {
                  key: "customers",
                  label: "Identified customers",
                  align: "right",
                  render: (row) => number(row.customers),
                },
              ],
              rows: data.monthly,
            }}
          >
            <MonthlyTrend monthly={data.monthly} />
          </ChartPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <TopProducts products={data.top_products} refreshing={refreshing} />
            <Countries countries={data.countries} refreshing={refreshing} />
          </div>

          <Note>
            {percent(data.kpis.identified_sales_share, 0)} of this sales value comes from invoices with a customer ID.
            The rest has no customer attached, so it counts here but not on the segment and churn pages.
          </Note>
        </div>
      )}
    </>
  );
}
