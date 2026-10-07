"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { FAQ } from "./landing-copy";
import { LandingChrome } from "./LandingChrome";
import { LandingPricingPlans } from "./LandingPricingPlans";
import { Reveal } from "./Reveal";

const PRICING_FAQ = FAQ.filter((item) =>
  /ERP|implementation|medical advice|AI run/i.test(item.q),
);

export function PricingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <LandingChrome signedIn={signedIn}>
      <main className="overflow-x-hidden pt-16">
        <section className="relative">
          <div className="pf-hero-wash pointer-events-none absolute inset-x-0 top-0 h-[42%]" />
          <div className="relative mx-auto w-[min(1180px,calc(100%-1.5rem))] py-20 md:py-28">
            <p className="text-sm font-semibold text-[#5B8CFF]">Pricing</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              Transparent list prices. In Kenyan shillings.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[#A7AFB8]">
              Monthly, VAT exclusive. Implementation is scoped after a plant walkthrough. Every plan ends in a call —
              not a self-serve checkout.
            </p>
            <LandingPricingPlans />
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#111418]/60">
          <Reveal className="mx-auto grid w-[min(1180px,calc(100%-1.5rem))] gap-8 py-16 md:grid-cols-3">
            {[
              { title: "List, not a cart", body: "Prices are published so the conversation is honest. We do not take card payments on this site." },
              { title: "Scoped after the walkthrough", body: "Implementation, data mapping, and training sit beside the monthly licence — sized to the plant, not a generic package." },
              { title: "Human-gated writes", body: "Every plan keeps a person on inventory, buying, and quality. AI is explain-on-request, never a surprise invoice on page load." },
            ].map((item) => (
              <div key={item.title}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#A7AFB8]">{item.body}</p>
              </div>
            ))}
          </Reveal>
        </section>

        <section className="mx-auto w-[min(800px,calc(100%-1.5rem))] py-24">
          <Reveal>
            <p className="text-sm font-semibold text-[#5B8CFF]">Before the call</p>
            <h2 className="mt-3 text-3xl font-semibold md:text-4xl">What buyers usually ask.</h2>
            <div className="pf-faq mt-10 divide-y divide-white/8 border-y border-white/8">
              {PRICING_FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-4 text-left text-[17px] font-medium">
                    {item.q}
                    <ChevronDown className="pf-faq-chevron size-5 shrink-0 text-[#A7AFB8] transition" strokeWidth={1.5} />
                  </summary>
                  <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[#A7AFB8]">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="border-t border-white/5">
          <Reveal className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-16 text-center md:py-20">
            <h2 className="text-3xl font-semibold md:text-4xl">Ready to scope a workspace?</h2>
            <p className="mx-auto mt-3 max-w-lg text-[#A7AFB8]">
              Book a call. We walk the site, then we quote implementation beside the list price.
            </p>
            <Link href="/#contact" className="pf-btn-primary mt-8 inline-flex rounded-lg px-6 py-3 text-[15px] font-semibold text-white">
              Book a call
            </Link>
          </Reveal>
        </section>
      </main>
    </LandingChrome>
  );
}
