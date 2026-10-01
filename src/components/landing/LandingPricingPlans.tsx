import Link from "next/link";

import { PLANS } from "./landing-copy";

export function LandingPricingPlans({ contactHref = "/#contact" }: { contactHref?: string }) {
  return (
    <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-3">
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
  );
}
