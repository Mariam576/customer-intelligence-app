import { useId, useState } from "react";
import { riskColor, segmentColor, shortSegment } from "../lib/theme.js";

/* ---------- page furniture ---------- */

export function PageHeader({ title, description, children }) {
  return (
    <header className="mb-5">
      <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
      {description && <p className="mt-1 max-w-[72ch] text-[14px] text-ink-2">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">{children}</div>}
    </header>
  );
}

export function Panel({ title, subtitle, actions, children, className = "", refreshing = false }) {
  return (
    <section className={`min-w-0 rounded-lg bg-surface ring-1 ring-line ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div
        className={`px-5 pb-5 pt-3 transition-opacity ${refreshing ? "opacity-50" : "opacity-100"}`}
        aria-busy={refreshing}
      >
        {children}
      </div>
    </section>
  );
}

/** A chart with a table twin: every value is readable without hovering. */
export function ChartPanel({ title, subtitle, table, actions, children, refreshing, className }) {
  const [view, setView] = useState("chart");
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      refreshing={refreshing}
      className={className}
      actions={
        <>
          {actions}
          {table && (
            <Segmented
              label={`${title}: view`}
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          )}
        </>
      }
    >
      {view === "table" && table ? <DataTable {...table} maxHeight={320} /> : children}
    </Panel>
  );
}

/* ---------- controls ---------- */

export function Segmented({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-sunken p-0.5 ring-1 ring-line">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-[5px] px-2.5 py-1 text-[13px] font-medium transition-colors ${
              selected ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">
      {label}
      {children}
    </label>
  );
}

export function Select({ label, value, onChange, options, className = "" }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border-0 bg-surface px-2 text-[13px] text-ink ring-1 ring-line"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- tables ---------- */

export function DataTable({ columns, rows, maxHeight, onRowClick, rowKey, selectedKey, caption }) {
  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`sticky top-0 border-b border-line bg-surface px-2 py-2 align-bottom text-[12px] font-medium leading-tight text-ink-2 first:pl-0 last:pr-0 ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey ? rowKey(row) : index;
            const selected = selectedKey != null && key === selectedKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-line last:border-0 ${onRowClick ? "cursor-pointer hover:bg-sunken" : ""} ${
                  selected ? "bg-accent-wash" : ""
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-2 py-2 first:pl-0 last:pr-0 ${
                      column.align === "right" ? "tabular text-right" : "text-left"
                    } ${column.wrap ? "" : "whitespace-nowrap"}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- identity marks ---------- */

export function SegmentTag({ cluster, name, short = true }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{ background: segmentColor(cluster) }}
      />
      {short ? shortSegment(name) : name}
    </span>
  );
}

/** Shape changes with the level, so the band never depends on colour alone. */
export function RiskIcon({ level, size = 14 }) {
  const color = riskColor(level);
  if (level === "High") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.6 15.2 14H.8Z" fill={color} />
        <path d="M8 6.2v3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.9" r=".95" fill="#fff" />
      </svg>
    );
  }
  if (level === "Medium") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.9" y="2.9" width="10.2" height="10.2" rx="1.6" transform="rotate(45 8 8)" fill={color} />
        <path d="M5.4 8h5.2" stroke="#3b2a00" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={color} />
      <path d="m4.8 8.3 2.2 2.2 4.2-4.6" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RiskBadge({ level, suffix = " risk" }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RiskIcon level={level} />
      <span>
        {level}
        {suffix}
      </span>
    </span>
  );
}

/* ---------- chart pieces ---------- */

/** Shared look for Recharts tooltips. Value leads, label follows. */
export function TipBox({ title, rows, note }) {
  return (
    <div className="pointer-events-none max-w-[260px] rounded-md bg-surface px-3 py-2 text-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.14)] ring-1 ring-line">
      {title && <div className="mb-1 font-medium text-ink-2">{title}</div>}
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <span className="text-ink-2">{row.label}</span>
          <span className="tabular font-semibold text-ink">{row.value}</span>
        </div>
      ))}
      {note && <div className="mt-1 text-ink-2">{note}</div>}
    </div>
  );
}

/**
 * Horizontal bars with every value written at the bar tip, so nothing
 * depends on hovering. `rows`: [{ key, label, sublabel, value, display, extra }]
 */
export function BarList({ rows, color = "var(--s1)", max, labelWidth = "minmax(0, min(15rem, 52%))", valueWidth = "5.5rem" }) {
  const top = max ?? Math.max(...rows.map((row) => row.value), 0);
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid items-center gap-x-3 rounded-[4px] py-[7px] hover:bg-sunken"
          style={{ gridTemplateColumns: `${labelWidth} minmax(4rem, 1fr)` }}
        >
          <div className="min-w-0">
            <div className="truncate text-[13px]" title={row.label}>
              {row.label}
            </div>
            {row.sublabel && <div className="truncate text-[12px] text-ink-3">{row.sublabel}</div>}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="h-[14px] shrink-0 rounded-r-[4px]"
              style={{
                width: `calc((100% - ${valueWidth}) * ${top ? row.value / top : 0})`,
                minWidth: 2,
                background: row.color ?? color,
              }}
            />
            <span className="tabular whitespace-nowrap text-[13px] font-medium">{row.display}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Legend({ items }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-3.5 rounded-[2px]"
            style={{ background: item.color, opacity: item.opacity ?? 1 }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------- states ---------- */

export function Loading({ label = "Loading" }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-[13px] text-ink-2">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function ErrorNote({ error }) {
  return (
    <div role="alert" className="rounded-md bg-sunken px-4 py-3 text-[13px] text-ink ring-1 ring-line">
      {error?.message || String(error)}
    </div>
  );
}

export function Note({ children, className = "" }) {
  return <p className={`m-0 text-[12.5px] leading-snug text-ink-2 ${className}`}>{children}</p>;
}
