"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Shield, ShieldCheck, UserCheck, Building2 } from "lucide-react";

import Aurora from "@/components/react-bits/Aurora";
import CountUp from "@/components/react-bits/CountUp";
import FadeContent from "@/components/react-bits/FadeContent";
import Magnet from "@/components/react-bits/Magnet";

import "./pharmaflow-landing.css";

const TRUST = [
  "Manufacturers",
  "Distributors",
  "Medical suppliers",
  "Kenya-first",
  "Human approval",
] as const;

const QUOTES = [
  {
    quote: "Daily Review replaced the Monday scramble. We open with lots, shortages, and POs that need a person.",
    role: "Plant manager",
    city: "Nairobi",
  },
  {
    quote: "RFQs and purchase orders sit on the same trail as the shortage. Finance sees KSh committed without chasing threads.",
    role: "Procurement lead",
    city: "Mombasa",
  },
  {
    quote: "Expiry is a named lot, not a rumour. That is the difference for QA on a packing line.",
    role: "Quality operations",
    city: "Kisumu",
  },
] as const;

const FAQ = [
  {
    q: "Does Pharmaflow replace our ERP?",
    a: "No. Pharmaflow is the operating picture across inventory, materials, procurement, and production. It sits beside your ERP — it does not pretend to replace it overnight.",
  },
  {
    q: "Will it send WhatsApp or buy from suppliers for us?",
    a: "No. Pharmaflow prepares recommendations, drafts, and trails. A person still approves every write. We do not auto-buy, send messages, or pay suppliers.",
  },
  {
    q: "When does AI run — and what does it cost?",
    a: "Ordinary screens load with zero model calls. Explain is an explicit action, one request at a time. There are no surprise AI invoices on page load.",
  },
  {
    q: "Who is it for?",
    a: "Pharmaceutical manufacturers, distributors, and medical suppliers in Kenya and East Africa who need one workspace for Command Center, inventory, materials, and the buy desk.",
  },
  {
    q: "How does implementation work?",
    a: "Book a call, walk the plant with us, then we scope a tenant workspace. Pricing below is list; implementation is scoped after that walkthrough.",
  },
  {
    q: "Is this medical advice?",
    a: "No. Pharmaflow analyzes business and operational data. It does not provide clinical or medical advice.",
  },
] as const;

function CommandCenterMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[14px] bg-[#111418] text-left">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <div className="ml-3 flex min-w-0 items-center gap-2 text-[12px] text-[#A7AFB8]">
          <Image src="/brand/logo-mark-clear.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
          <span className="truncate">Command Center · Nairobi plant</span>
        </div>
      </div>
      <div
        className={
          compact
            ? "grid"
            : "grid lg:grid-cols-[7.75rem_minmax(0,1fr)_minmax(13.5rem,15.5rem)]"
        }
      >
        {!compact ? (
          <aside className="hidden border-r border-white/5 p-3 lg:block">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">Overview</p>
            <ul className="mt-2 space-y-0.5 text-[11px] leading-snug">
              <li className="rounded-md bg-[#5B8CFF]/15 px-2 py-1.5 text-[#5B8CFF]">Command Center</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Daily Review</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Inventory</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Materials</li>
              <li className="px-2 py-1.5 text-[#A7AFB8]">Procurement</li>
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
              <li className="rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
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

function SupplyChainMock() {
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
          <div key={row.step} className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0B0D0F] px-3 py-2.5">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${row.tone}`}>{row.step}</span>
            <span className="text-[13px] text-[#A7AFB8]">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalsMock() {
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

export function PharmaflowLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formNote, setFormNote] = useState(false);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;
      const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      let frame = 0;
      const raf = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
      destroy = () => {
        cancelAnimationFrame(frame);
        lenis.destroy();
      };
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormNote(true);
    event.currentTarget.reset();
  }

  return (
    <div className="pf-landing selection:bg-[#5B8CFF]/30">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#0B0D0F]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-[min(1160px,calc(100%-1.5rem))] items-center justify-between gap-4">
          <a href="#top" className="flex min-w-0 items-center gap-2.5">
            <Image src="/brand/logo-mark-clear.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="text-[15px] font-semibold tracking-tight">pharmaflow</span>
          </a>
          <nav className="hidden items-center gap-8 text-[13px] font-medium text-[#A7AFB8] lg:flex">
            <a className="hover:text-[#F5F7FA]" href="#product">
              Product
            </a>
            <a className="hover:text-[#F5F7FA]" href="#proof">
              Why
            </a>
            <a className="hover:text-[#F5F7FA]" href="#pricing">
              Pricing
            </a>
            <a className="hover:text-[#F5F7FA]" href="#faq">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Magnet padding={36} magnetStrength={3} wrapperClassName="hidden md:inline-block">
              <a href="#contact" className="pf-btn-primary inline-flex rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white">
                Book a call
              </a>
            </Magnet>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 lg:hidden"
              aria-label="Open menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">Menu</span>
              <span className="flex flex-col gap-1.5">
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "translate-y-[3.5px] rotate-45" : ""}`} />
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
              </span>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="border-t border-white/5 bg-[#0B0D0F] px-4 py-4 text-[14px] lg:hidden">
            <div className="mx-auto flex w-[min(1160px,100%)] flex-col gap-3 text-[#A7AFB8]">
              <a href="#product" onClick={() => setMenuOpen(false)}>
                Product
              </a>
              <a href="#proof" onClick={() => setMenuOpen(false)}>
                Why
              </a>
              <a href="#pricing" onClick={() => setMenuOpen(false)}>
                Pricing
              </a>
              <a href="#faq" onClick={() => setMenuOpen(false)}>
                FAQ
              </a>
              <a href="#contact" className="text-[#5B8CFF]" onClick={() => setMenuOpen(false)}>
                Book a call
              </a>
            </div>
          </div>
        ) : null}
      </header>

      <main id="top" className="overflow-x-hidden">
        {/* Hero — editorial split */}
        <section className="relative min-h-[100dvh] pt-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[70%] opacity-40">
            <Aurora colorStops={["#7DD3FC", "#5B8CFF", "#39C6B0"]} amplitude={0.7} blend={0.6} speed={0.55} />
          </div>
          <div className="pf-grid-fade pointer-events-none absolute inset-0" />

          <div className="relative mx-auto grid w-[min(1200px,calc(100%-1.5rem))] items-center gap-10 py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.28fr)] lg:gap-8 lg:py-28 xl:gap-10">
            <div className="min-w-0">
              <p className="text-[13px] font-medium tracking-wide text-[#7DD3FC]">
                AI-Powered Pharmaceutical Business Platform
              </p>
              <h1 className="mt-4 max-w-[18ch] text-[clamp(2.4rem,5vw,3.75rem)] leading-[1.08] font-semibold tracking-tight">
                Operations infrastructure for{" "}
                <span className="font-serif font-normal italic text-[#7DD3FC]">pharmaceutical companies.</span>
              </h1>
              <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-[#A7AFB8]">
                One Kenyan workspace for inventory, materials, procurement, and production. Pharmaflow prepares the
                morning picture. A person still approves every write.
              </p>
              <div className="mt-8">
                <Magnet padding={48} magnetStrength={2.5}>
                  <a href="#contact" className="pf-btn-primary inline-flex rounded-lg px-5 py-2.5 text-[15px] font-semibold text-white">
                    Book a call
                  </a>
                </Magnet>
              </div>
            </div>

            <FadeContent blur duration={800} className="pf-hero-mock min-w-0">
              <div className="pf-mock-ring rounded-2xl p-px">
                <div className="pf-hero-mock-float">
                  <CommandCenterMock />
                </div>
              </div>
            </FadeContent>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-white/5 bg-[#111418]/90">
          <div className="mx-auto flex w-[min(1160px,calc(100%-1.5rem))] flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5 text-[12px] font-medium tracking-[0.14em] text-[#A7AFB8] uppercase">
            {TRUST.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        {/* Product chapters */}
        <section id="product" className="mx-auto w-[min(1160px,calc(100%-1.5rem))] py-28 md:py-32">
          <FadeContent blur>
            <p className="text-sm font-semibold text-[#5B8CFF]">Product</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
              Three chapters. One operating picture.
            </h2>
            <p className="mt-4 max-w-xl text-lg text-[#A7AFB8]">
              Built for manufacturers, distributors, and medical suppliers who need Command Center, the supply chain,
              and human control in the same tenant.
            </p>
          </FadeContent>

          <div className="mt-16 space-y-24 md:space-y-28">
            <FadeContent blur className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="text-sm font-semibold text-[#7DD3FC]">Command</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                  The picture the MD opens on Monday.
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                  Health, what matters now, and a path into inventory, materials, and procurement — without twelve
                  logins or a morning spreadsheet hunt.
                </p>
              </div>
              <div className="pf-mock-ring rounded-2xl p-px">
                <CommandCenterMock compact />
              </div>
            </FadeContent>

            <FadeContent blur className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div className="order-2 lg:order-1">
                <SupplyChainMock />
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-sm font-semibold text-[#7DD3FC]">Supply chain</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                  From shortage to receive — still human-gated.
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                  Materials net against the plan. RFQs, awards, purchase orders, and receipts stay on one trail.
                  Pharmaflow drafts. A manager still signs. We do not auto-buy.
                </p>
              </div>
            </FadeContent>

            <FadeContent blur className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="text-sm font-semibold text-[#7DD3FC]">Control</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                  Preparation is automated. Authority is not.
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                  Execution and approvals keep a person on every write. Explain-on-request AI never runs on ordinary
                  page loads — and never gives medical advice.
                </p>
              </div>
              <ApprovalsMock />
            </FadeContent>
          </div>
        </section>

        {/* Proof + quotes */}
        <section id="proof" className="bg-[#111418]">
          <div className="mx-auto w-[min(1160px,calc(100%-1.5rem))] py-28 md:py-32">
            <FadeContent blur>
              <p className="text-sm font-semibold text-[#7DD3FC]">Why Pharmaflow</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold md:text-5xl">
                Built for how Kenyan plants actually run.
              </h2>
            </FadeContent>

            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-4xl font-semibold tabular-nums text-[#5B8CFF] md:text-5xl">
                  <CountUp to={1} duration={1.2} />
                </p>
                <p className="mt-2 text-sm text-[#A7AFB8]">operating picture across command, inventory, materials, and the buy</p>
              </div>
              <div>
                <p className="text-4xl font-semibold tabular-nums text-[#5B8CFF] md:text-5xl">
                  <CountUp to={12} duration={1.4} />
                </p>
                <p className="mt-2 text-sm text-[#A7AFB8]">rooms in one tenant — from Daily Review to receiving</p>
              </div>
              <div>
                <p className="text-4xl font-semibold text-[#5B8CFF] md:text-5xl">Human</p>
                <p className="mt-2 text-sm text-[#A7AFB8]">approval on every write. No autonomous buying or messaging</p>
              </div>
              <div>
                <p className="text-4xl font-semibold text-[#5B8CFF] md:text-5xl">KSh</p>
                <p className="mt-2 text-sm text-[#A7AFB8]">native pricing and board figures for Kenyan companies</p>
              </div>
            </div>

            <div className="mt-16 grid gap-4 md:grid-cols-3">
              {QUOTES.map((item) => (
                <FadeContent key={item.city} blur>
                  <blockquote className="pf-surface flex h-full flex-col rounded-xl p-6">
                    <p className="flex-1 text-[16px] leading-relaxed text-[#F5F7FA]/90">&ldquo;{item.quote}&rdquo;</p>
                    <footer className="mt-5 text-sm text-[#A7AFB8]">
                      {item.role} · {item.city}
                      <span className="mt-1 block text-[11px] tracking-wide text-white/35 uppercase">Illustrative operator voice</span>
                    </footer>
                  </blockquote>
                </FadeContent>
              ))}
            </div>
          </div>
        </section>

        {/* How booking works */}
        <section className="mx-auto w-[min(1160px,calc(100%-1.5rem))] py-28 md:py-32">
          <FadeContent blur>
            <p className="text-sm font-semibold text-[#5B8CFF]">How it works</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold md:text-5xl">From call to scoped workspace.</h2>
          </FadeContent>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { n: "01", title: "Book a call", body: "Tell us what you do, the site, and the pressure you want on the table." },
              { n: "02", title: "Plant walkthrough", body: "We map inventory, materials, and the buy desk against how you already operate." },
              { n: "03", title: "Scoped workspace", body: "A tenant shaped to your plant. List pricing below; implementation after the walkthrough." },
            ].map((step) => (
              <FadeContent key={step.n} blur>
                <div className="pf-surface rounded-xl p-6">
                  <p className="font-mono text-[12px] tracking-widest text-[#5B8CFF]">{step.n}</p>
                  <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[#A7AFB8]">{step.body}</p>
                </div>
              </FadeContent>
            ))}
          </div>
        </section>

        {/* Security / control */}
        <section className="border-y border-white/5 bg-[#111418]/60">
          <div className="mx-auto grid w-[min(1160px,calc(100%-1.5rem))] gap-8 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Building2, title: "Tenant isolation", body: "Each company in its own workspace." },
              { icon: UserCheck, title: "Human approval", body: "A person on every write." },
              { icon: Shield, title: "No autonomous buying", body: "Drafts and trails — not auto-pay." },
              { icon: ShieldCheck, title: "Not medical advice", body: "Business and operations data only." },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <item.icon className="mt-0.5 size-5 shrink-0 text-[#5B8CFF]" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-[#A7AFB8]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto w-[min(1160px,calc(100%-1.5rem))] py-28 md:py-32">
          <FadeContent blur>
            <p className="text-sm font-semibold text-[#5B8CFF]">Pricing</p>
            <h2 className="mt-3 text-4xl font-semibold md:text-5xl">Transparent list prices. In Kenyan shillings.</h2>
            <p className="mt-4 max-w-xl text-lg text-[#A7AFB8]">
              Monthly, VAT exclusive. Implementation is scoped after a plant walkthrough. Every plan ends in a call —
              not a self-serve checkout.
            </p>
          </FadeContent>

          <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-3">
            <FadeContent blur className="h-full">
              <div className="pf-surface flex h-full flex-col rounded-xl p-7">
                <p className="text-sm font-semibold text-[#A7AFB8]">Plant</p>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  KSh 145,000<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span>
                </p>
                <p className="mt-3 text-[#A7AFB8]">
                  One manufacturing site. Command Center, Daily Review, inventory, materials, operations, explain-on-request AI.
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-[#A7AFB8]">
                  <li>Up to 25 operators</li>
                  <li>Tenant-scoped workspace</li>
                  <li>Human approval on every write</li>
                </ul>
                <a href="#contact" className="mt-8 inline-flex justify-center rounded-lg border border-white/12 py-2.5 text-sm font-semibold">
                  Book a call
                </a>
              </div>
            </FadeContent>

            <FadeContent blur className="h-full">
              <div className="relative flex h-full flex-col rounded-xl border border-[#5B8CFF]/45 bg-[#111418] p-7 shadow-[0_0_0_1px_rgba(91,140,255,0.15),0_20px_40px_rgba(0,0,0,0.35)]">
                <span className="absolute -top-3 left-6 rounded-full bg-[#5B8CFF] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Recommended
                </span>
                <p className="text-sm font-semibold text-[#5B8CFF]">Network</p>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  KSh 385,000<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span>
                </p>
                <p className="mt-3 text-[#A7AFB8]">
                  The buy desk on the same picture: RFQs, POs, receiving, suppliers, forecast, scenarios.
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-[#A7AFB8]">
                  <li>Everything in Plant</li>
                  <li>Up to 80 operators</li>
                  <li>Execution queue and supplier scorecards</li>
                </ul>
                <Magnet padding={36} magnetStrength={2.5} wrapperClassName="mt-8 block w-full">
                  <a href="#contact" className="pf-btn-primary inline-flex w-full justify-center rounded-lg py-2.5 text-sm font-semibold text-white">
                    Book a call
                  </a>
                </Magnet>
              </div>
            </FadeContent>

            <FadeContent blur className="h-full">
              <div className="pf-surface flex h-full flex-col rounded-xl p-7">
                <p className="text-sm font-semibold text-[#A7AFB8]">Group</p>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  From KSh 720,000<span className="text-sm font-medium text-[#A7AFB8]"> / mo</span>
                </p>
                <p className="mt-3 text-[#A7AFB8]">
                  Several sites, board reporting, path to a distributor portal. Scoped to how the group actually runs.
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-[#A7AFB8]">
                  <li>Everything in Network</li>
                  <li>Multi-site isolation review</li>
                  <li>Executive reporting in KSh</li>
                </ul>
                <a href="#contact" className="mt-8 inline-flex justify-center rounded-lg border border-white/12 py-2.5 text-sm font-semibold">
                  Book a call
                </a>
              </div>
            </FadeContent>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-white/5 bg-[#111418]/40">
          <div className="mx-auto w-[min(800px,calc(100%-1.5rem))] py-28 md:py-32">
            <FadeContent blur>
              <p className="text-sm font-semibold text-[#5B8CFF]">FAQ</p>
              <h2 className="mt-3 text-4xl font-semibold md:text-5xl">Answers before the call.</h2>
            </FadeContent>
            <div className="pf-faq mt-10 divide-y divide-white/8 border-y border-white/8">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-4 text-left text-[17px] font-medium">
                    {item.q}
                    <ChevronDown className="pf-faq-chevron size-5 shrink-0 text-[#A7AFB8] transition" strokeWidth={1.5} />
                  </summary>
                  <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[#A7AFB8]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA band + form */}
        <section className="bg-[#0B0D0F]">
          <div className="mx-auto w-[min(1160px,calc(100%-1.5rem))] border-y border-white/5 py-16 text-center md:py-20">
            <h2 className="text-3xl font-semibold md:text-4xl">Ready to put the plant on one picture?</h2>
            <p className="mx-auto mt-3 max-w-lg text-[#A7AFB8]">
              Book a call. We will walk the site and scope a Kenyan workspace — billed in KSh.
            </p>
            <Magnet padding={48} magnetStrength={2.5} wrapperClassName="mt-8 inline-block">
              <a href="#contact" className="pf-btn-primary inline-flex rounded-lg px-6 py-3 text-[15px] font-semibold text-white">
                Book a call
              </a>
            </Magnet>
          </div>
        </section>

        <section id="contact" className="mx-auto w-[min(1160px,calc(100%-1.5rem))] py-28 md:py-32">
          <FadeContent blur>
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#111418] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="p-8 md:p-12">
                <Image
                  src="/brand/logo-full-clear.png"
                  alt="pharmaflow — AI-Powered Pharmaceutical Business Platform"
                  width={320}
                  height={106}
                  className="h-12 w-auto max-w-full object-contain object-left"
                />
                <h2 className="mt-8 text-3xl font-semibold md:text-4xl">Book a call</h2>
                <p className="mt-4 max-w-[40ch] text-lg text-[#A7AFB8]">
                  A short intake so we arrive prepared — who you are, what the company does, and the pressure you want
                  to talk through.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-[#A7AFB8]">
                  <li>30–45 minutes with an operations lead</li>
                  <li>We cover your plant picture, not a product pitch deck</li>
                  <li>No medical advice — commercial and ops only</li>
                  <li>Follow-up on work email or WhatsApp</li>
                </ul>
              </div>
              <form
                id="contact-form"
                onSubmit={onSubmit}
                className="border-t border-white/5 p-8 md:border-t-0 md:border-l md:p-12"
              >
                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">You</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Full name
                      <input required name="name" autoComplete="name" className="pf-field" />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-[12px] font-medium text-[#A7AFB8]">
                        Work email
                        <input required type="email" name="email" autoComplete="email" className="pf-field" />
                      </label>
                      <label className="block text-[12px] font-medium text-[#A7AFB8]">
                        Phone or WhatsApp
                        <input required type="tel" name="phone" autoComplete="tel" placeholder="+254…" className="pf-field" />
                      </label>
                    </div>
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Your role
                      <select required name="role" defaultValue="" className="pf-field">
                        <option value="" disabled>
                          Select role
                        </option>
                        <option value="md-owner">MD / Owner</option>
                        <option value="operations">Operations / Plant</option>
                        <option value="procurement">Procurement / Supply chain</option>
                        <option value="finance">Finance / Commercial</option>
                        <option value="it">IT / Systems</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">Company</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Company name
                      <input required name="company" autoComplete="organization" className="pf-field" />
                    </label>
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      What does your company do?
                      <select required name="companyType" defaultValue="" className="pf-field">
                        <option value="" disabled>
                          Select type
                        </option>
                        <option value="manufacturer">Pharmaceutical manufacturer</option>
                        <option value="distributor">Distributor / wholesaler</option>
                        <option value="medical-supplier">Medical / hospital supplier</option>
                        <option value="group">Multi-site group / holding</option>
                        <option value="other">Other (tell us below)</option>
                      </select>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-[12px] font-medium text-[#A7AFB8]">
                        Primary site / city
                        <input required name="site" placeholder="e.g. Nairobi" className="pf-field" />
                      </label>
                      <label className="block text-[12px] font-medium text-[#A7AFB8]">
                        Sites in scope
                        <select required name="sites" defaultValue="" className="pf-field">
                          <option value="" disabled>
                            Select
                          </option>
                          <option value="1">1 site</option>
                          <option value="2-5">2–5 sites</option>
                          <option value="6+">6+ sites</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Rough catalogue size
                      <select name="catalogue" defaultValue="" className="pf-field">
                        <option value="">Optional</option>
                        <option value="under-200">Under 200 SKUs</option>
                        <option value="200-1000">200–1,000 SKUs</option>
                        <option value="1000+">1,000+ SKUs</option>
                        <option value="unsure">Not sure yet</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">Call focus</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      What is the main pressure right now?
                      <select required name="pressure" defaultValue="" className="pf-field">
                        <option value="" disabled>
                          Select focus
                        </option>
                        <option value="morning-picture">One morning operating picture</option>
                        <option value="inventory">Inventory / expiry / lots</option>
                        <option value="materials">Materials shortages</option>
                        <option value="procurement">Procurement / RFQs</option>
                        <option value="approvals">Approvals and control</option>
                        <option value="multi-site">Multi-site visibility</option>
                        <option value="other">Something else</option>
                      </select>
                    </label>
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Anything we should know before the call?
                      <textarea
                        name="message"
                        rows={3}
                        placeholder="Systems you use today, ERP constraints, who else should join…"
                        className="pf-field resize-y"
                      />
                    </label>
                    <label className="block text-[12px] font-medium text-[#A7AFB8]">
                      Preferred call window
                      <select name="timing" defaultValue="flexible" className="pf-field">
                        <option value="morning">Weekday mornings (EAT)</option>
                        <option value="afternoon">Weekday afternoons (EAT)</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </label>
                  </div>
                </fieldset>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Magnet padding={40} magnetStrength={2.5}>
                    <button type="submit" className="pf-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
                      Request a call
                    </button>
                  </Magnet>
                  <p className="text-[12px] text-[#A7AFB8]">We reply within one business day. No medical advice.</p>
                </div>
                {formNote ? (
                  <p className="mt-4 text-sm text-[#7DD3FC]">
                    Received. We will follow up on your work email or WhatsApp. Pharmaflow does not give medical advice.
                  </p>
                ) : null}
              </form>
            </div>
          </FadeContent>
        </section>

        <footer className="border-t border-white/5">
          <div className="mx-auto grid w-[min(1160px,calc(100%-1.5rem))] gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <a href="#top" className="inline-flex items-center gap-2">
                <Image src="/brand/logo-mark-clear.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                <span className="text-sm font-semibold">pharmaflow</span>
              </a>
              <p className="mt-4 max-w-[24ch] text-sm text-[#A7AFB8]">
                AI-Powered Pharmaceutical Business Platform. Kenya.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
                <li>
                  <a href="#product">Command</a>
                </li>
                <li>
                  <a href="#product">Supply chain</a>
                </li>
                <li>
                  <a href="#pricing">Pricing</a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Company</p>
              <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
                <li>
                  <a href="#proof">Why Pharmaflow</a>
                </li>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
                <li>
                  <a href="#contact">Book a call</a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Contact</p>
              <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
                <li>
                  <a href="#contact">Book a call</a>
                </li>
                <li>Nairobi · Mombasa · Kisumu</li>
              </ul>
            </div>
          </div>
          <div className="mx-auto w-[min(1160px,calc(100%-1.5rem))] border-t border-white/5 py-6 text-sm text-white/35">
            © 2026 Pharmaflow. Prices in KSh, VAT excl. Not medical advice.
          </div>
        </footer>
      </main>
    </div>
  );
}
