"use client";

import Image from "next/image";

import { OPS_EVENTS } from "./landing-copy";

/* ------------------------------------------------------------------ */
/*  Command Center                                                     */
/* ------------------------------------------------------------------ */

export function CommandCenterMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[14px] bg-[#0E1216] text-left">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="pf-traffic" />
        <span className="pf-traffic" />
        <span className="pf-traffic pf-traffic-live" />
        <div className="ml-3 flex min-w-0 items-center gap-2 text-[12px] text-[#9AA4B2]">
          <Image src="/brand/logo-mark-clear.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
          <span className="truncate">Command Center · Nairobi plant</span>
          <span className="ml-auto hidden shrink-0 sm:block">
            <span className="pf-live-pill">Live picture</span>
          </span>
        </div>
      </div>
      <div className={compact ? "grid" : "grid lg:grid-cols-[7.75rem_minmax(0,1fr)_minmax(13.5rem,15.5rem)]"}>
        {!compact ? (
          <aside className="hidden border-r border-white/5 p-3 lg:block">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">Overview</p>
            <ul className="mt-2 space-y-0.5 text-[11px] leading-snug">
              <li className="rounded-md bg-[#5B8CFF]/15 px-2 py-1.5 text-[#7DD3FC]">Command Center</li>
              <li className="px-2 py-1.5 text-[#9AA4B2]">Daily Review</li>
              <li className="px-2 py-1.5 text-[#9AA4B2]">Inventory</li>
              <li className="px-2 py-1.5 text-[#9AA4B2]">Materials</li>
              <li className="px-2 py-1.5 text-[#9AA4B2]">Quality</li>
            </ul>
          </aside>
        ) : null}
        <div className={`min-w-0 border-white/5 p-4 ${compact ? "" : "border-b lg:border-r lg:border-b-0"}`}>
          <p className="text-[10px] font-medium tracking-wide text-[#9AA4B2] uppercase">Business health</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,0.85fr)] gap-2">
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
              <p className="text-[10px] text-[#9AA4B2]">Revenue</p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight tabular-nums">
                <span className="text-[11px] font-medium text-[#9AA4B2]">KSh </span>
                423M
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
              <p className="text-[10px] text-[#9AA4B2]">Open RFQs</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">7</p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
              <p className="text-[10px] text-[#9AA4B2]">Lots at risk</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#F2B84B]">4</p>
            </div>
          </div>
          <div className="mt-3 h-[5.5rem] rounded-lg border border-white/5 bg-[#06080B] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#9AA4B2]">Trailing 30 days</p>
              <p className="text-[10px] font-semibold text-[#5EEAD4]">+6.2%</p>
            </div>
            <svg viewBox="0 0 280 48" className="mt-1.5 h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="pfChartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="pfChartStroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#5B8CFF" />
                  <stop offset="100%" stopColor="#7DD3FC" />
                </linearGradient>
              </defs>
              <path d="M0 36 C 35 34, 55 20, 80 24 S 125 6, 160 14 S 210 30, 250 10 L 280 16 L 280 48 L 0 48 Z" fill="url(#pfChartFill)" />
              <path d="M0 36 C 35 34, 55 20, 80 24 S 125 6, 160 14 S 210 30, 250 10 L 280 16" fill="none" stroke="url(#pfChartStroke)" strokeWidth="2" />
              <circle cx="280" cy="16" r="3" fill="#7DD3FC" />
            </svg>
          </div>
        </div>
        {!compact ? (
          <div className="min-w-0 p-4">
            <p className="text-[10px] font-medium tracking-wide text-[#9AA4B2] uppercase">What matters now</p>
            <ol className="mt-3 space-y-2 text-[12px]">
              <li className="pf-rail-high rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
                <p className="text-[9px] font-semibold tracking-wide text-[#F26D6D] uppercase">High · Materials</p>
                <p className="mt-1 leading-snug font-medium">Foil net-short vs plan</p>
              </li>
              <li className="pf-rail-watch rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
                <p className="text-[9px] font-semibold tracking-wide text-[#F2B84B] uppercase">Watch · Inventory</p>
                <p className="mt-1 leading-snug font-medium">Amoxicillin · expiry window</p>
              </li>
              <li className="pf-rail-info rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5">
                <p className="text-[9px] font-semibold tracking-wide text-[#5B8CFF] uppercase">Info · Procurement</p>
                <p className="mt-1 leading-snug font-medium">Two RFQs awaiting award</p>
              </li>
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supply chain trail                                                 */
/* ------------------------------------------------------------------ */

export function SupplyChainMock() {
  return (
    <div className="pf-surface overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Procurement trail · demo</span>
        <span className="font-mono text-[11px] text-white/35">PO-2026-0418</span>
      </div>
      <div className="space-y-2 p-4">
        {[
          { step: "Shortage", detail: "Packaging foil · net short 1,200 m", tone: "text-[#F2B84B]", rail: "pf-rail-watch" },
          { step: "RFQ", detail: "Draft raised · 3 suppliers", tone: "text-[#5B8CFF]", rail: "pf-rail-info" },
          { step: "Award", detail: "Manager approval required", tone: "text-[#7DD3FC]", rail: "pf-rail-info" },
          { step: "Receive", detail: "Lot into inventory · QC pending", tone: "text-[#5EEAD4]", rail: "" },
        ].map((row) => (
          <div key={row.step} className={`${row.rail} flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#06080B] px-3 py-2.5`}>
            <span className={`text-[11px] font-semibold tracking-wide uppercase ${row.tone}`}>{row.step}</span>
            <span className="truncate text-[13px] text-[#9AA4B2]">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Approvals                                                          */
/* ------------------------------------------------------------------ */

export function ApprovalsMock() {
  return (
    <div className="pf-surface overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Execution queue · awaiting a person</span>
        <span className="pf-state-pill pf-state-review">3 pending</span>
      </div>
      <div className="space-y-2 p-4">
        {[
          { title: "Raise foil RFQ", who: "Procurement", status: "Review" },
          { title: "Approve purchase order", who: "Manager", status: "Pending" },
          { title: "Confirm receipt lot", who: "Receiving", status: "Ready" },
        ].map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#06080B] px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{row.title}</p>
              <p className="text-[11px] text-[#9AA4B2]">Needs · {row.who}</p>
            </div>
            <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-[#9AA4B2]">{row.status}</span>
          </div>
        ))}
        <p className="pt-1 text-[12px] text-[#9AA4B2]">Pharmaflow prepares. A person still signs.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ops stream                                                         */
/* ------------------------------------------------------------------ */

export function OpsLog() {
  return (
    <div className="pf-glass overflow-hidden rounded-2xl font-mono">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>ops.stream · Nairobi</span>
        <span className="pf-live-pill">Live picture</span>
      </div>
      <ul className="space-y-1 p-3 text-[12px] leading-relaxed">
        {OPS_EVENTS.map((event, index) => (
          <li key={event.t} className={`rounded-md px-2 py-1.5 ${index === 0 ? "bg-white/6 text-[#F4F7FB]" : "text-[#9AA4B2]"}`}>
            <span className="text-white/35">{event.t}</span>
            <span className={`mx-2 text-[10px] font-semibold tracking-wide uppercase pf-tone-${event.tone}`}>{event.domain}</span>
            {event.text}
          </li>
        ))}
        <li className="px-2 py-1.5 text-white/35">
          <span className="inline-block h-3 w-[7px] animate-pulse bg-[#7DD3FC]/70 align-middle" aria-hidden="true" />
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Traceability — lot → batch → product → order                       */
/* ------------------------------------------------------------------ */

export function TraceMock({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const nodes = [
    { x: 24, y: 60, label: "RM-API-0412", sub: "Material lot", lit: true },
    { x: 104, y: 24, label: "LAB-2026-003", sub: "Batch", lit: true },
    { x: 104, y: 96, label: "LAB-2026-004", sub: "Batch · hold", lit: false },
    { x: 190, y: 60, label: "Amoxicillin 500", sub: "Product", lit: true },
    { x: 272, y: 36, label: "SO-7F21", sub: "Order · Mombasa", lit: true },
    { x: 272, y: 84, label: "SO-7F2A", sub: "Order · Kisumu", lit: false },
  ];
  return (
    <div className={`pf-surface overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Traceability · forward trace</span>
        <span className="pf-state-pill pf-state-review">Partial</span>
      </div>
      <div className="p-3">
        <svg viewBox="0 0 300 120" className="h-auto w-full" role="img" aria-label="Lot to batch to product to order genealogy">
          <path className="pf-trace-line" d="M40 60 C 70 60, 70 24, 96 24" />
          <path className="pf-trace-line" d="M40 60 C 70 60, 70 96, 96 96" />
          <path className="pf-trace-line" d="M112 24 C 150 24, 150 60, 182 60" />
          <path className="pf-trace-line" d="M112 96 C 150 96, 150 60, 182 60" />
          <path className="pf-trace-line" d="M198 60 C 230 60, 230 36, 264 36" />
          <path className="pf-trace-line" d="M198 60 C 230 60, 230 84, 264 84" />
          {nodes.map((node) => (
            <g key={node.label}>
              <circle cx={node.x} cy={node.y} r="7" className={`pf-trace-node ${node.lit ? "is-lit" : ""}`} />
              {node.lit ? <circle cx={node.x} cy={node.y} r="2.5" fill="#7DD3FC" /> : null}
            </g>
          ))}
        </svg>
        {compact ? (
          <p className="mt-1 px-1 text-[11px] text-[#9AA4B2]">
            <span className="font-mono text-[#F4F7FB]">RM-API-0412</span> → 2 batches → 2 orders · 1 allocation unrecorded
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[#9AA4B2]">
              {[
                ["RM-API-0412", "material lot"],
                ["LAB-2026-003", "released batch"],
                ["SO-7F21", "customer order"],
              ].map(([code, type]) => (
                <div key={code} className="rounded-md border border-white/5 bg-[#06080B] px-2 py-1.5">
                  <p className="truncate font-mono text-[10px] text-[#F4F7FB]">{code}</p>
                  <p className="truncate">{type}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#9AA4B2]">Batch-to-order allocation not recorded — exposure is product-matched only.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lot expiry heat                                                    */
/* ------------------------------------------------------------------ */

const HEAT = [
  0, 1, 1, 0, 2, 1, 0, 0, 1, 2, 3, 1,
  1, 0, 2, 1, 1, 0, 3, 1, 0, 2, 1, 0,
  0, 1, 0, 2, 4, 1, 1, 0, 2, 1, 3, 1,
  1, 2, 1, 0, 1, 3, 0, 1, 1, 0, 2, 4,
];

export function ExpiryHeatMock({ className = "" }: { className?: string }) {
  return (
    <div className={`pf-surface overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Inventory · lot expiry window</span>
        <span className="font-mono text-[11px] text-white/35">48 lots</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-12 gap-1">
          {HEAT.map((level, index) => (
            <span key={index} className={`pf-heat-cell pf-heat-${level}`} aria-hidden="true" />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9AA4B2]">
          <span>
            <span className="font-mono text-[#F4F7FB]">AMX-500-0229</span> · 41 days
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="pf-heat-cell pf-heat-1 inline-block w-2.5" /> &gt;180d
            <span className="pf-heat-cell pf-heat-3 ml-2 inline-block w-2.5" /> &lt;90d
            <span className="pf-heat-cell pf-heat-4 ml-2 inline-block w-2.5" /> &lt;45d
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Materials — MRP netting                                            */
/* ------------------------------------------------------------------ */

export function MrpNetMock({ className = "" }: { className?: string }) {
  const rows = [
    { name: "Packaging foil", need: 100, have: 62, tone: "pf-bar-rose", label: "net short" },
    { name: "Amoxicillin API", need: 100, have: 100, tone: "pf-bar-mint", label: "covered" },
    { name: "Gelatin capsules", need: 100, have: 81, tone: "pf-bar-amber", label: "at risk" },
    { name: "Blister PVC", need: 100, have: 100, tone: "pf-bar-mint", label: "covered" },
  ];
  return (
    <div className={`pf-surface overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Materials · net vs plan</span>
        <span className="font-mono text-[11px] text-white/35">14-day horizon</span>
      </div>
      <div className="space-y-3 p-4">
        {rows.map((row, index) => (
          <div key={row.name}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium">{row.name}</span>
              <span className="text-[11px] text-[#9AA4B2]">{row.label}</span>
            </div>
            <div className={`pf-bar mt-1.5 ${row.tone}`}>
              <span style={{ width: `${row.have}%`, animationDelay: `${index * 90}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Batch quality states                                               */
/* ------------------------------------------------------------------ */

export function BatchStatesMock({ className = "" }: { className?: string }) {
  const rows = [
    { batch: "LAB-2026-001", product: "Amoxicillin 500", state: "release", label: "Released" },
    { batch: "LAB-2026-003", product: "Paracetamol 500", state: "review", label: "Pending review" },
    { batch: "LAB-2026-004", product: "Cetirizine 10", state: "hold", label: "On hold" },
    { batch: "LAB-2026-005", product: "Metformin 850", state: "reject", label: "Rejected" },
  ];
  return (
    <div className={`pf-surface overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Batches · quality disposition</span>
        <span className="font-mono text-[11px] text-white/35">1 hold · 1 reject</span>
      </div>
      <ul className="divide-y divide-white/5">
        {rows.map((row) => (
          <li key={row.batch} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] text-[#F4F7FB]">{row.batch}</p>
              <p className="truncate text-[11px] text-[#9AA4B2]">{row.product}</p>
            </div>
            <span className={`pf-state-pill pf-state-${row.state}`}>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Audit trail                                                        */
/* ------------------------------------------------------------------ */

export function AuditMock({ className = "" }: { className?: string }) {
  const rows = [
    { who: "A. Otieno", role: "Manager", what: "Approved PO-2026-0418", when: "09:14" },
    { who: "J. Wanjiru", role: "Quality", what: "Placed LAB-2026-004 on hold", when: "08:52" },
    { who: "S. Kamau", role: "Operations", what: "Released production order", when: "08:31" },
  ];
  return (
    <div className={`pf-surface overflow-hidden rounded-xl ${className}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#9AA4B2]">
        <span>Governance · audit trail</span>
        <span className="font-mono text-[11px] text-white/35">append-only</span>
      </div>
      <ul className="divide-y divide-white/5 text-[12px]">
        {rows.map((row) => (
          <li key={row.what} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 font-mono text-[11px] text-white/35">{row.when}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.what}</p>
              <p className="truncate text-[11px] text-[#9AA4B2]">
                {row.who} · {row.role}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
