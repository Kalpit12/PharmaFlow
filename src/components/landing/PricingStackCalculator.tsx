"use client";

import { useMemo, useState } from "react";

import { compareStack, formatKes } from "@/lib/pricing/stack-compare";

import { PRICING_BENCHMARK } from "./landing-copy";

export function PricingStackCalculator() {
  const [workstations, setWorkstations] = useState(8);
  const [reportUsers, setReportUsers] = useState(25);

  const result = useMemo(() => compareStack(workstations, reportUsers), [workstations, reportUsers]);

  return (
    <div className="pf-surface rounded-xl border border-[#5B8CFF]/25 p-6 md:p-8">
      <p className="text-sm font-semibold text-[#5B8CFF]">Stack calculator</p>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#A7AFB8]">
        Adjust scheduled workstations (SkyPlanner model) and report viewers (Power BI Pro). We compare published list
        prices — implementation and ERP integration are quoted separately on every path.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <label className="block">
            <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
              Scheduled workstations
              <span className="tabular-nums text-[#5B8CFF]">{workstations}</span>
            </span>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={workstations}
              onChange={(event) => setWorkstations(Number(event.target.value))}
              className="mt-3 w-full accent-[#5B8CFF]"
            />
            <span className="mt-1 block text-[11px] text-[#7A8490]">SkyPlanner includes 5; +€20/mo each extra (list).</span>
          </label>
          <label className="block">
            <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
              Power BI Pro report users
              <span className="tabular-nums text-[#5B8CFF]">{reportUsers}</span>
            </span>
            <input
              type="range"
              min={5}
              max={80}
              step={1}
              value={reportUsers}
              onChange={(event) => setReportUsers(Number(event.target.value))}
              className="mt-3 w-full accent-[#5B8CFF]"
            />
            <span className="mt-1 block text-[11px] text-[#7A8490]">$14/user/mo list (paid yearly) — everyone who shares reports.</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-white/8 bg-[#0A0D11]/50 px-4 py-3">
            <p className="text-[11px] font-medium tracking-wide text-[#A7AFB8] uppercase">SkyPlanner APS (list)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatKes(result.sky)}<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span></p>
          </div>
          <div className="rounded-lg border border-white/8 bg-[#0A0D11]/50 px-4 py-3">
            <p className="text-[11px] font-medium tracking-wide text-[#A7AFB8] uppercase">Power BI Pro (list)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatKes(result.bi)}<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span></p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0A0D11]/50 px-4 py-3">
            <p className="text-[11px] font-medium tracking-wide text-[#A7AFB8] uppercase">Typical APS + BI stack</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[#C5CDD6]">{formatKes(result.stack)}<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span></p>
          </div>
          <div className="rounded-lg border border-[#5EEAD4]/35 bg-[#5EEAD4]/10 px-4 py-3">
            <p className="text-[11px] font-medium tracking-wide text-[#5EEAD4] uppercase">
              Pharmaflow {result.pharma.label} (list)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[#F4F7FB]">
              {formatKes(result.pharma.monthlyKes)}
              <span className="text-sm font-medium text-[#A7AFB8]"> / mo</span>
            </p>
            {result.savings > 0 ? (
              <p className="mt-2 text-[13px] text-[#5EEAD4]">
                About {formatKes(result.savings)} / mo less than APS + BI on list ({result.savingsPct}% on software
                licences alone).
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-[#A7AFB8]">At this size, book a call — we will map the right plan.</p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-[#7A8490]">{PRICING_BENCHMARK.footnote}</p>
    </div>
  );
}
