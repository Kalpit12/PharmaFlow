"use client";

import Link from "next/link";

import { NEXORA, NEXORA_CAPABILITIES, NEXORA_WORK } from "./landing-copy";
import { LandingChrome } from "./LandingChrome";
import { Reveal } from "./Reveal";

export function AboutPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <LandingChrome signedIn={signedIn}>
      <main className="overflow-x-hidden pt-16">
        <section className="relative">
          <div className="pf-hero-wash pointer-events-none absolute inset-x-0 top-0 h-[48%]" />
          <div className="relative mx-auto w-[min(1180px,calc(100%-1.5rem))] py-20 md:py-28">
            <p className="text-sm font-semibold text-[#5B8CFF]">About us</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              {NEXORA.name} builds Pharmaflow — and the digital systems around it.
            </h1>
            <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-[#A7AFB8]">{NEXORA.blurb}</p>
            <p className="mt-4 text-sm text-[#A7AFB8]">
              {NEXORA.city} · Founded {NEXORA.founded} · Working with ambitious businesses in Kenya and beyond.
            </p>
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#111418]/60">
          <Reveal className="mx-auto grid w-[min(1180px,calc(100%-1.5rem))] gap-12 py-20 md:grid-cols-2 md:py-28">
            <div>
              <p className="text-sm font-semibold text-[#7DD3FC]">Who we are</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A Nairobi studio. Products that fit how the business actually runs.</h2>
            </div>
            <div className="space-y-4 text-lg leading-relaxed text-[#A7AFB8]">
              <p>
                NExora Digital is a technology studio in Nairobi. We design websites, AI-assisted operations, and custom
                software — not slideware. The brief starts with the commercial problem, then we engineer around customers,
                operators, and the tools you already use.
              </p>
              <p>
                Pharmaflow is our pharmaceutical operations product: command, inventory, materials, procurement, batches,
                and quality in one Kenyan workspace. It is built for manufacturers, distributors, and medical suppliers.
                It is not medical advice, and it does not buy, message, or pay anyone on its own.
              </p>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-20 md:py-28">
          <Reveal>
            <p className="text-sm font-semibold text-[#5B8CFF]">What we build</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold md:text-4xl">From a high-performance site to a full operating picture.</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {NEXORA_CAPABILITIES.map((item) => (
                <div key={item.title} className="pf-surface rounded-xl p-6">
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#A7AFB8]">{item.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="border-y border-white/5 bg-[#111418]/40">
          <Reveal className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-20 md:py-28">
            <p className="text-sm font-semibold text-[#7DD3FC]">Selected work</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold md:text-4xl">Digital products for Kenyan businesses.</h2>
            <p className="mt-4 max-w-[54ch] text-[#A7AFB8]">
              Public examples of sites and platforms NExora Digital has shipped. Pharmaflow is the operations SaaS on
              this domain.
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {NEXORA_WORK.map((item) => (
                <div key={item.name} className="rounded-xl border border-white/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5B8CFF] uppercase">{item.field}</p>
                  <h3 className="mt-2 text-lg font-semibold">{item.name}</h3>
                  <p className="mt-2 text-sm text-[#A7AFB8]">{item.note}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-20 md:py-28">
          <Reveal className="overflow-hidden rounded-2xl border border-white/8 bg-[#111418] lg:grid lg:grid-cols-2">
            <div className="p-8 md:p-12">
              <p className="text-sm font-semibold text-[#5B8CFF]">Talk to us</p>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Nairobi, and on a call.</h2>
              <p className="mt-4 max-w-[40ch] text-lg text-[#A7AFB8]">
                For Pharmaflow, book an operations call. For websites, AI systems, or another product, reach the studio
                directly.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-[#A7AFB8]">
                <li>{NEXORA.city}</li>
                <li>
                  <a className="text-[#7DD3FC] hover:underline" href={`mailto:${NEXORA.email}`}>
                    {NEXORA.email}
                  </a>
                </li>
                <li>
                  <a className="text-[#7DD3FC] hover:underline" href={`tel:${NEXORA.phone.replace(/\s/g, "")}`}>
                    {NEXORA.phone}
                  </a>
                </li>
                <li>
                  <a className="text-[#7DD3FC] hover:underline" href={NEXORA.site} rel="noreferrer" target="_blank">
                    {NEXORA.siteLabel}
                  </a>
                </li>
              </ul>
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-white/5 p-8 md:border-t-0 md:border-l md:p-12">
              <Link href="/#contact" className="pf-btn-primary inline-flex justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
                Book a Pharmaflow call
              </Link>
              <Link href="/pricing" className="inline-flex justify-center rounded-lg border border-white/12 px-5 py-2.5 text-sm font-semibold">
                See Pharmaflow pricing
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
    </LandingChrome>
  );
}
