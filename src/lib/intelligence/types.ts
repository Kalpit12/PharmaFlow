export const INTELLIGENCE_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type IntelligenceSeverity = (typeof INTELLIGENCE_SEVERITIES)[number];

export const INTELLIGENCE_CONFIDENCE = ["KNOWN", "PARTIAL", "INSUFFICIENT_DATA"] as const;
export type IntelligenceConfidence = (typeof INTELLIGENCE_CONFIDENCE)[number];

export const INTELLIGENCE_DOMAINS = [
  "production",
  "materials",
  "procurement",
  "suppliers",
  "batches",
  "quality",
  "traceability",
  "commercial",
] as const;
export type IntelligenceDomain = (typeof INTELLIGENCE_DOMAINS)[number];

export const OPERATIONAL_FACT_TYPES = [
  "PRODUCTION_RISK",
  "MATERIAL_SHORTAGE",
  "MATERIAL_AT_RISK",
  "PROCUREMENT_RISK",
  "SUPPLIER_RISK",
  "QUALITY_EXCEPTION",
  "QUALITY_IMPACT",
  "TRACEABILITY_IMPACT",
  "DELIVERY_RISK",
  "CAPACITY_RISK",
  "REVENUE_RISK",
  "CUSTOMER_IMPACT",
  "BATCH_HOLD",
] as const;
export type OperationalFactType = (typeof OPERATIONAL_FACT_TYPES)[number];

export type OperationalEvidence = {
  label: string;
  value: string;
};

export type OperationalFact = {
  id: string;
  type: OperationalFactType;
  severity: IntelligenceSeverity;
  confidence: IntelligenceConfidence;
  domain: IntelligenceDomain;
  title: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  reason: string;
  evidence: OperationalEvidence[];
  relatedDomains: IntelligenceDomain[];
  href: string;
};

export type OperationalInsight = {
  id: string;
  factIds: string[];
  severity: IntelligenceSeverity;
  confidence: IntelligenceConfidence;
  domain: IntelligenceDomain;
  relatedDomains: IntelligenceDomain[];
  what: string;
  why: string;
  impact: string;
  source: string;
  href: string;
};

export type OperationalPriority = {
  id: string;
  rank: number;
  band: IntelligenceSeverity;
  score: number;
  scoreReasons: string[];
  insightId: string;
  title: string;
  reason: string;
  impact: string;
  domain: IntelligenceDomain;
  relatedDomains: IntelligenceDomain[];
  confidence: IntelligenceConfidence;
  href: string;
};

export type OperationalChange = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  summary: string;
  confidence: IntelligenceConfidence;
};

export type IntelligenceSnapshot = {
  generatedAt: string;
  openaiCallsOnLoad: 0;
  facts: OperationalFact[];
  insights: OperationalInsight[];
  priorities: OperationalPriority[];
  bands: {
    critical: OperationalPriority[];
    high: OperationalPriority[];
    watch: OperationalPriority[];
  };
  changes: OperationalChange[];
  changeNote: string;
  excludedDomains: IntelligenceDomain[];
  disclaimer: string;
};

export type IntelligenceExplanation = {
  summary: string;
  reasons: string[];
  impacts: string[];
  reviewItems: string[];
  limitations: string[];
  source: "deterministic" | "openai";
};

export type CompactIntelligenceContext = {
  question: string;
  priorities: Array<{
    rank: number;
    band: string;
    title: string;
    reason: string;
    impact: string;
    domain: string;
    related: string[];
    confidence: string;
  }>;
  production: Array<{ title: string; reason: string; evidence: string[] }>;
  materials: Array<{ title: string; reason: string; evidence: string[] }>;
  procurement: Array<{ title: string; reason: string; evidence: string[] }>;
  quality: Array<{ title: string; reason: string; evidence: string[] }>;
  traceability: Array<{ title: string; reason: string; evidence: string[] }>;
  commercial: Array<{ title: string; reason: string; evidence: string[] }>;
  changes: Array<{ action: string; summary: string }>;
  excludedDomains: string[];
  changeNote: string;
};
