// Colour and naming rules shared by every page.

// Segment colours follow the segment, never its position in a list, so a
// filter can't repaint them. Order: most valuable segment first.
// (Cluster ids come from the saved K-Means model.)
export const SEGMENT_ORDER = [2, 0, 1, 3];

const SEGMENT_COLOR = {
  2: "var(--s1)", // High-Value Active
  0: "var(--s2)", // Previously Active
  1: "var(--s3)", // Recent Developing
  3: "var(--s4)", // Infrequent / Inactive
};

export function segmentColor(cluster) {
  return SEGMENT_COLOR[cluster] ?? "var(--neutral-mark)";
}

/** "High-Value Active Customers" -> "High-Value Active" */
export function shortSegment(name) {
  return (name || "").replace(/\s+Customers$/i, "");
}

export const RISK_LEVELS = ["High", "Medium", "Low"];

const RISK_COLOR = {
  High: "var(--critical)",
  Medium: "var(--warning)",
  Low: "var(--good)",
};

export function riskColor(level) {
  return RISK_COLOR[level] ?? "var(--neutral-mark)";
}
