import type { ForecastConfidence } from "@/lib/forecasting/types";
import type { StatusTone } from "@/types/status";

export const confidenceTone: Record<ForecastConfidence, StatusTone> = {
  HIGH: "success",
  MEDIUM: "info",
  LOW: "warning",
  INSUFFICIENT: "neutral",
};

export const riskSeverityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};
