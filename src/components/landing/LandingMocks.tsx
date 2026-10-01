"use client";

import Image from "next/image";

import { OPS_EVENTS } from "./landing-copy";

export function CommandCenterMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[14px] bg-[#111418] text-left">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="pf-traffic" />
        <span className="pf-traffic" />
        <span className="pf-traffic pf-traffic-live" />
        <div className="ml-3 flex min-w-0 items-center gap-2 text-[12px] text-[#A7AFB8]">
          <Image src="/brand/logo-mark-clear.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
          <span className="truncate">Command Center · Nairobi plant</span>
          <span className="pf-live-pill ml-auto hidden sm:inline-flex">Live picture</span>
        </div>
      </div>
      <div className={compact ? "grid" : "grid lg:grid-cols-[7.75rem_minmax(0,1fr)_minmax(13.5rem,15.5rem)]"}>
        {!compact ? (
          <aside className="hidden border-r border-white/5 p-3 lg:block">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">Overview</p>
            <ul className="mt-2 space-y-0.5 text-[11px] leading-snug">
              <li className="rounded-md bg-[#5B8CFF]/15 px-2 py-1.5 text-[#5B8CFF]">Command Center</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Daily Review</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Inventory</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Materials</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Quality</li>
            </ul>
          </aside>
        ) : null}
        <div className={`min-w-0 border-white/5 p-4 ${compact ? "" : "border-b lg:border-r lg:border-b-0"}`}>
          <p className="text-[10px] font-medium tracking-wide text-[#A7AFB8] uppercase">Business health</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,0.85fr)] gap-2">
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
              <p className="text-[10px] text-[#A7AFB8]">Revenue</p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight tabular-nums">
                <span className="text-[11px] font-medium text-[#A7AFB8]">KSh </span>
                423M
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
              <p className="text-[10px] text-[#A7AFB8]">Open RFQs</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">7</p>
            </div>
            <div className="min-w-0 rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
              <p className="text-[10px] text-[#A7AFB8]">Lots at risk</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">4</p>
            </div>
          </div>
          <div className="mt-3 h-[5.5rem] rounded-lg border border-white/5 bg-[#0B0D0F] p-3">
            <p className="text-[10px] text-[#A7AFB8]">Trailing 30 days</p>
            <svg viewBox="0 0 280 48" className="mt-1.5 h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="pfChartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 36 C 35 34, 55 20, 80 24 S 125 6, 160 14 S 210 30, 250 10 L 280 16 L 280 48 L 0 48 Z"
                fill="url(#pfChartFill)"
              />
              <path
                d="M0 36 C 35 34, 55 20, 80 24 S 125 6, 160 14 S 210 30, 250 10 L 280 16"
                fill="none"
                stroke="#5B8CFF"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        {!compact ? (
          <div className="min-w-0 p-4">
            <p className="text-[10px] font-medium tracking-wide text-[#A7AFB8] uppercase">What matters now</p>
            <ol className="mt-3 space-y-2 text-[12px]">
              <li className="pf-attention-row rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
                <p className="text-[9px] font-semibold tracking-wide text-[#E06A6A] uppercase">High · Materials</p>
                <p className="mt-1 leading-snug font-medium">Foil net-short vs plan</p>
              </li>
              <li className="rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
                <p className="text-[9px] font-semibold tracking-wide text-[#E4B95A] uppercase">Watch · Inventory</p>
                <p className="mt-1 leading-snug font-medium">Amoxicillin · expiry window</p>
              </li>
              <li className="rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
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

export function SupplyChainMock() {
  return (
    <div className="pf-surface overflow-hidden rounded-xl">
      <div className="border-b border-white/5 px-4 py-3 text-[12px] text-[#A7AFB8]">Procurement trail · demo</div>
      <div className="space-y-2 p-4">
        {[
          { step: "Shortage", detail: "Packaging foil · net short", tone: "text-[#E4B95A]" },
          { step: "RFQ", detail: "Draft raised · 3 suppliers", tone: "text-[#5B8CFF]" },
          { step: "Award", detail: "Manager approval required", tone: "text-[#7DD3FC]" },
          { step: "Receive", detail: "Lot into inventory", tone: "text-[#39C6B0]" },
        ].map((row) => (
          <div
            key={row.step}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5"
          >
            <span className={`text-[11px] font-semibold tracking-wide uppercase ${row.tone}`}>{row.step}</span>
            <span className="text-[13px] text-[#A7AFB8]">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalsMock() {
  return (
    <div className="pf-surface overflow-hidden rounded-xl">
      <div className="border-b border-white/5 px-4 py-3 text-[12px] text-[#A7AFB8]">Execution queue · awaiting person</div>
      <div className="space-y-2 p-4">
        {[
          { title: "Raise foil RFQ", status: "Review" },
          { title: "Approve purchase order", status: "Pending" },
          { title: "Confirm receipt lot", status: "Ready" },
        ].map((row) => (
          <div key={row.title} className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-3">
            <span className="text-[14px] font-medium">{row.title}</span>
            <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-[#A7AFB8]">{row.status}</span>
          </div>
        ))}
        <p className="pt-1 text-[12px] text-[#A7AFB8]">Pharmaflow prepares. A person still signs.</p>
      </div>
    </div>
  );
}

export function OpsLog() {
  return (
    <div className="pf-surface overflow-hidden rounded-xl font-mono">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[12px] text-[#A7AFB8]">
        <span>ops.stream · Nairobi</span>
        <span className="pf-live-pill">Live picture</span>
      </div>
      <ul className="space-y-1 p-3 text-[12px] leading-relaxed">
        {OPS_EVENTS.map((event, index) => (
          <li
            key={event.t}
            className={`rounded-md px-2 py-1.5 ${index === 0 ? "bg-white/6 text-[#F5F7FA]" : "text-[#A7AFB8]"}`}
          >
            <span className="text-white/35">{event.t}</span>
            <span className={`mx-2 text-[10px] font-semibold tracking-wide uppercase pf-tone-${event.tone}`}>{event.domain}</span>
            {event.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
