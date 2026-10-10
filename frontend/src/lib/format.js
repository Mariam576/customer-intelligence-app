// Number and date formatting used across the dashboard.

const gbpWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const gbpPence = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** £19.70M, £623.8K, £498 */
export function gbpCompact(value) {
  if (value == null) return "–";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `£${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `£${(value / 1e3).toFixed(1)}K`;
  return gbpWhole.format(value);
}

/** Axis ticks: £0, £500K, £1.5M */
export function gbpAxis(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `£${+(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `£${+(value / 1e3).toFixed(0)}K`;
  return `£${value}`;
}

export function gbp(value, { pence = false } = {}) {
  if (value == null) return "–";
  return pence ? gbpPence.format(value) : gbpWhole.format(value);
}

export function number(value) {
  if (value == null) return "–";
  return whole.format(value);
}

/** 11.2M, 39.5K, 816 */
export function numberCompact(value) {
  if (value == null) return "–";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  return whole.format(value);
}

export function percent(value, digits = 0) {
  if (value == null) return "–";
  return `${(value * 100).toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2011-03" -> "Mar 2011" */
export function monthLabel(key, { short = false } = {}) {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1];
  return short ? `${name} ’${year.slice(2)}` : `${name} ${year}`;
}

export function monthName(key) {
  return MONTHS[Number(key.split("-")[1]) - 1];
}

/** ISO string -> "9 Jun 2011" (no timezone shifting: the data has none) */
export function dateLabel(iso) {
  if (!iso) return "–";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** The last day inside a window that ends just before `iso`. */
export function dayBefore(iso) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
}

export function days(value) {
  if (value == null) return "–";
  const rounded = Math.round(value);
  return `${whole.format(rounded)} ${rounded === 1 ? "day" : "days"}`;
}

/** How one model input should read: "5 invoices", "£2,817", "21 days" */
export function featureValue(feature, value) {
  switch (feature) {
    case "Monetary":
    case "Avg_Invoice_Value":
      return gbp(value);
    case "Recency_Days":
    case "Customer_Tenure_Days":
      return days(value);
    case "Frequency":
      return `${number(value)} ${value === 1 ? "invoice" : "invoices"}`;
    case "Active_Months":
      return `${number(value)} ${value === 1 ? "month" : "months"}`;
    case "Total_Units":
      return `${number(value)} units`;
    case "Unique_Products":
      return `${number(value)} ${value === 1 ? "product" : "products"}`;
    default:
      return number(value);
  }
}
