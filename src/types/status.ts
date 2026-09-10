export type Priority = "high" | "medium" | "low";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "primary"
  /** Operational intelligence (teal) — flow, completion, supply movement. */
  | "intel"
  /** Pharmaceutical material signal (amber) — expiry, ageing, procurement urgency. */
  | "material";
