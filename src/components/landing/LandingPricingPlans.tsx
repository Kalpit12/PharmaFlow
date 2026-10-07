import Link from "next/link";

import { PLANS, PRICING_BENCHMARK } from "./landing-copy";

export function LandingPricingPlans({ contactHref = "/#contact" }: { contactHref?: string }) {
  return (
    <div className="mt-14 space-y-10">
      <div className="pf-surface rounded-xl border border-[#5EEAD4]/20 p-6 md:p-8">
        <p className="text-sm font-semibold text-[#5EEAD4]">Why teams switch</p>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#A7AFB8]">
          Most plants stitch together APS scheduling and BI dashboards — then pay again for inventory, materials, and
          approvals. Pharmaflow list pricing is set under that combined stack.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_BENCHMARK.rows.map((row) => (
            <li
              key={row.label}
              className={
                row.highlight
                  ? "rounded-lg border border-[#5B8CFF]/40 bg-[#5B8CFF]/10 px-4 py-3"
                  : "rounded-lg border border-white/8 bg-[#0A0D11]/40 px-4 py-3"
              }
            >
              <p className="text-[11px] font-medium tracking-wide text-[#A7AFB8] uppercase">{row.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${row.highlight ? "text-[#F4F7FB]" : "text-[#C5CDD6]"}`}>
                {row.amount}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-relaxed text-[#7A8490]">{PRICING_BENCHMARK.footnote}</p>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div key={plan.id} className="h-full">
          <div
            className={
              plan.featured
                ? "pf-featured relative flex h-full flex-col rounded-xl border border-[#5B8CFF]/45 bg-[#111418] p-7"
                : "pf-surface flex h-full flex-col rounded-xl p-7"
            }
          >
            {plan.featured ? (
              <span className="self-start rounded-full bg-[#5B8CFF] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                Recommended
              </span>
            ) : null}
            <p className={`text-sm font-semibold ${plan.featured ? "mt-3 text-[#5B8CFF]" : "text-[#A7AFB8]"}`}>{plan.name}</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">
              {plan.price}
              <span className="text-sm font-medium text-[#A7AFB8]">{plan.period}</span>
            </p>
            <p className="mt-3 text-[#A7AFB8]">{plan.body}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-[#5EEAD4]/90">{plan.savings}</p>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-[#A7AFB8]">
              {plan.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link
              href={contactHref}
              className={
                plan.featured
                  ? "pf-btn-primary mt-8 inline-flex w-full justify-center rounded-lg py-2.5 text-sm font-semibold text-white"
                  : "mt-8 inline-flex justify-center rounded-lg border border-white/12 py-2.5 text-sm font-semibold"
              }
            >
              Book a call
            </Link>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
