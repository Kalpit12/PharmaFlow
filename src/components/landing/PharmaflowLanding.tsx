"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Building2, ChevronDown, Shield, ShieldCheck, UserCheck } from "lucide-react";

import CountUp from "@/components/react-bits/CountUp";

import { FAQ, MODULES, QUOTES, ROTATING, TRUST } from "./landing-copy";
import { ApprovalsMock, CommandCenterMock, OpsLog, SupplyChainMock } from "./LandingMocks";
import { LandingChrome } from "./LandingChrome";
import { LandingWorkflow } from "./LandingWorkflow";
import { Reveal } from "./Reveal";

import "./pharmaflow-landing.css";

export function PharmaflowLanding() {
  const reduced = useReducedMotion();
  const [formNote, setFormNote] = useState(false);
  const [word, setWord] = useState(0);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setWord((index) => (index + 1) % ROTATING.length), 3200);
    return () => window.clearInterval(id);
  }, [reduced]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormNote(true);
    event.currentTarget.reset();
  }

  function onPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = document.querySelector<HTMLTextAreaElement>("#contact-form textarea[name='message']");
    if (field && prompt.trim()) field.value = prompt.trim();
    document.getElementById("contact")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <LandingChrome>
      <main id="top" className="overflow-x-hidden">
        <section className="relative min-h-[100dvh] pt-16">
          <div className="pf-hero-wash pointer-events-none absolute inset-x-0 top-0 h-[78%]" />
          <div className="pf-grid-fade pointer-events-none absolute inset-0" />

          <div className="pf-hero-copy relative mx-auto flex w-[min(1100px,calc(100%-1.5rem))] flex-col items-center pt-16 pb-8 text-center md:pt-20">
            <p className="text-[13px] font-medium tracking-[0.18em] text-[#7DD3FC] uppercase">
              Pharmaceutical operations SaaS
            </p>
            <h1 className="mt-5 max-w-[16ch] text-[clamp(2.6rem,7vw,5.1rem)] leading-[0.98] font-semibold tracking-tight">
              The{" "}
              <span className="font-serif font-normal italic pf-gradient-word">operating system</span> for pharmaceutical{" "}
              <span className="relative inline-flex min-h-[1em] min-w-[13ch] justify-center overflow-hidden align-baseline">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={ROTATING[word]}
                    initial={reduced ? false : { y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduced ? undefined : { y: -12, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="font-serif font-normal italic text-[#7DD3FC]"
                  >
                    {ROTATING[word]}.
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[#A7AFB8]">
              Command, inventory, materials, procurement, batches, and quality in one Kenyan workspace. Pharmaflow
              prepares the morning picture. A person still approves every write.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="#contact" className="pf-btn-primary inline-flex rounded-lg px-5 py-2.5 text-[15px] font-semibold text-white">
                Book a call
              </a>
              <a href="#product" className="pf-btn-ghost inline-flex rounded-lg px-5 py-2.5 text-[15px] font-medium">
                See the product
              </a>
            </div>
            <form onSubmit={onPrompt} className="pf-prompt mt-8 w-full max-w-xl text-left">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the pressure on your plant…"
                aria-label="Describe the pressure on your plant"
              />
              <button type="submit" className="pf-btn-primary shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white">
                Continue
              </button>
            </form>
          </div>

          <div className="relative mx-auto w-[min(1180px,calc(100%-1.5rem))] pb-20 md:pb-28">
            <div className="pf-hero-stage relative md:px-12 lg:px-16">
              <div className="pf-hero-device relative">
                <div className="pf-mock-ring rounded-2xl p-px">
                  <CommandCenterMock />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 hidden md:block">
                <div className="pf-float-chip absolute top-3 left-2 max-w-[13.5rem] lg:left-0">
                  <p className="text-[10px] font-semibold tracking-wide text-[#E06A6A] uppercase">High · Materials</p>
                  <p className="mt-0.5 font-medium">Foil net-short vs plan</p>
                </div>
                <div className="pf-float-chip pf-float-chip-b absolute top-3 right-0 max-w-[14rem] md:right-2 lg:-right-6">
                  <p className="text-[10px] font-semibold tracking-wide text-[#E4B95A] uppercase">Watch · Inventory</p>
                  <p className="mt-0.5 font-medium">Amoxicillin expiry window</p>
                </div>
                <div className="pf-float-chip pf-float-chip-c absolute -bottom-2 left-8 hidden max-w-[15rem] lg:block">
                  <p className="text-[10px] font-semibold tracking-wide text-[#5B8CFF] uppercase">Info · Procurement</p>
                  <p className="mt-0.5 font-medium">Two RFQs awaiting award</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#111418]/90 py-5">
          <div className="pf-marquee">
            <div className="pf-marquee-track">
              {[...MODULES, ...MODULES].map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
              ))}
            </div>
          </div>
          <div className="mx-auto mt-4 flex w-[min(1180px,calc(100%-1.5rem))] flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] font-medium tracking-[0.14em] text-white/35 uppercase">
            {TRUST.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section id="product" className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
          <Reveal>
            <p className="text-sm font-semibold text-[#5B8CFF]">Product</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              A SaaS control room — not another dashboard template.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-[#A7AFB8]">
              Built for manufacturers, distributors, and medical suppliers who need command, supply chain, and human
              control in the same tenant.
            </p>
          </Reveal>

          <Reveal className="mt-14 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="pf-surface h-full rounded-xl p-5">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#7DD3FC] uppercase">Command Center</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">The picture the MD opens on Monday.</h3>
                <div className="mt-5">
                  <CommandCenterMock compact />
                </div>
              </div>
            </div>
            <div>
              <div className="pf-surface h-full rounded-xl p-6">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#39C6B0] uppercase">Control</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Authority stays human.</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#A7AFB8]">
                  Execution and approvals keep a person on every write. Explain-on-request AI never runs on ordinary
                  page loads — and never gives medical advice.
                </p>
                <div className="mt-6">
                  <ApprovalsMock />
                </div>
              </div>
            </div>
            <div>
              <div className="pf-surface h-full rounded-xl p-6">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#D6A85F] uppercase">Supply chain</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">Shortage to receive, still gated.</h3>
                <p className="mt-3 text-sm text-[#A7AFB8]">Materials net against the plan. RFQs, awards, POs, and receipts stay on one trail.</p>
              </div>
            </div>
            <div>
              <div className="pf-surface h-full rounded-xl p-6">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5B8CFF] uppercase">Quality</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">Batches, holds, exceptions.</h3>
                <p className="mt-3 text-sm text-[#A7AFB8]">Operational quality and traceability sit beside production — not a fabricated QMS claim.</p>
              </div>
            </div>
            <div>
              <div className="pf-surface h-full rounded-xl p-6">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#7DD3FC] uppercase">Kenya-native</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">Board figures in KSh.</h3>
                <p className="mt-3 text-sm text-[#A7AFB8]">Pricing, reporting, and the demo tenant are built for Kenyan pharmaceutical operations.</p>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-16">
            <LandingWorkflow />
          </Reveal>
        </section>

        <section id="platform" className="border-y border-white/5 bg-[#111418]">
          <Reveal className="mx-auto grid w-[min(1180px,calc(100%-1.5rem))] items-center gap-12 py-28 md:py-32 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-[#7DD3FC]">Live operations</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">The morning stream, already ranked.</h2>
              <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                Attention lands with domain, severity, and a destination. No twelve-login hunt. No invented clinical
                claims — business and operations data only.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-[#A7AFB8]">
                <li>Zero model calls on ordinary page load</li>
                <li>Tenant-scoped workspaces</li>
                <li>Human approval before inventory, buying, or quality writes</li>
              </ul>
            </div>
            <div>
              <OpsLog />
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
          <div className="space-y-24 md:space-y-28">
            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="text-sm font-semibold text-[#7DD3FC]">Command</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Health, attention, and a path in.</h3>
                <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                  What matters now routes into inventory, materials, procurement, batches, and quality — without a
                  morning spreadsheet hunt.
                </p>
              </div>
              <div className="pf-mock-ring rounded-2xl p-px">
                <CommandCenterMock compact />
              </div>
            </Reveal>

            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div className="order-2 lg:order-1">
                <SupplyChainMock />
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-sm font-semibold text-[#7DD3FC]">Supply chain</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">From shortage to receive.</h3>
                <p className="mt-4 text-lg leading-relaxed text-[#A7AFB8]">
                  Pharmaflow drafts. A manager still signs. We do not auto-buy, message suppliers, or pay anyone.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="proof" className="bg-[#111418]">
          <Reveal className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
            <div>
              <p className="text-sm font-semibold text-[#7DD3FC]">Why Pharmaflow</p>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold md:text-5xl">Built for how Kenyan plants actually run.</h2>
            </div>

            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-4xl font-semibold tabular-nums text-[#5B8CFF] md:text-5xl">
                  <CountUp to={1} duration={1.2} />
                </p>
                <p className="mt-2 text-sm text-[#A7AFB8]">operating picture across command, inventory, materials, and the buy</p>
              </div>
              <div>
                <p className="text-4xl font-semibold tabular-nums text-[#5B8CFF] md:text-5xl">
                  <CountUp to={20} duration={1.4} />
                  <span>+</span>
                </p>
                <p className="mt-2 text-sm text-[#A7AFB8]">workspaces in one tenant — from Daily Review to quality</p>
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
                <div key={item.city}>
                  <div className="pf-surface h-full rounded-xl p-6">
                    <blockquote className="flex h-full flex-col">
                      <p className="flex-1 text-[16px] leading-relaxed text-[#F5F7FA]/90">&ldquo;{item.quote}&rdquo;</p>
                      <footer className="mt-5 text-sm text-[#A7AFB8]">
                        {item.role} · {item.city}
                        <span className="mt-1 block text-[11px] tracking-wide text-white/35 uppercase">Illustrative operator voice</span>
                      </footer>
                    </blockquote>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
          <Reveal>
            <p className="text-sm font-semibold text-[#5B8CFF]">How it works</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold md:text-5xl">From call to scoped workspace.</h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { n: "01", title: "Book a call", body: "Tell us what you do, the site, and the pressure you want on the table." },
              { n: "02", title: "Plant walkthrough", body: "We map inventory, materials, and the buy desk against how you already operate." },
              { n: "03", title: "Scoped workspace", body: "A tenant shaped to your plant. List pricing is on the pricing page; implementation after the walkthrough." },
            ].map((step) => (
              <div key={step.n}>
                <div className="pf-surface h-full rounded-xl p-6">
                  <p className="font-mono text-[12px] tracking-widest text-[#5B8CFF]">{step.n}</p>
                  <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[#A7AFB8]">{step.body}</p>
                </div>
              </div>
            ))}
            </div>
          </Reveal>
        </section>

        <section className="border-y border-white/5 bg-[#111418]/60">
          <Reveal className="mx-auto grid w-[min(1180px,calc(100%-1.5rem))] gap-8 py-14 sm:grid-cols-2 lg:grid-cols-4">
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
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
          <Reveal>
            <p className="text-sm font-semibold text-[#5B8CFF]">Pricing</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold md:text-5xl">Transparent list prices. In Kenyan shillings.</h2>
            <p className="mt-4 max-w-xl text-lg text-[#A7AFB8]">
              Plant, Network, and Group — monthly, VAT exclusive. Every plan ends in a call, not a checkout.
            </p>
            <a href="/pricing" className="pf-btn-primary mt-8 inline-flex rounded-lg px-5 py-2.5 text-[15px] font-semibold text-white">
              See pricing
            </a>
          </Reveal>
        </section>

        <section id="faq" className="border-t border-white/5 bg-[#111418]/40">
          <Reveal className="mx-auto w-[min(800px,calc(100%-1.5rem))] py-28 md:py-32">
            <div>
              <p className="text-sm font-semibold text-[#5B8CFF]">FAQ</p>
              <h2 className="mt-3 text-4xl font-semibold md:text-5xl">Answers before the call.</h2>
            </div>
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
          </Reveal>
        </section>

        <section className="relative overflow-hidden bg-[#0B0D0F]">
          <Reveal className="relative mx-auto w-[min(1180px,calc(100%-1.5rem))] border-y border-white/5 py-16 text-center md:py-20">
            <h2 className="text-3xl font-semibold md:text-4xl">Ready to put the plant on one picture?</h2>
            <p className="mx-auto mt-3 max-w-lg text-[#A7AFB8]">
              Book a call. We will walk the site and scope a Kenyan workspace — billed in KSh.
            </p>
            <a href="#contact" className="pf-btn-primary mt-8 inline-flex rounded-lg px-6 py-3 text-[15px] font-semibold text-white">
              Book a call
            </a>
          </Reveal>
        </section>

        <section id="contact" className="mx-auto w-[min(1180px,calc(100%-1.5rem))] py-28 md:py-32">
          <Reveal>
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
              <form id="contact-form" onSubmit={onSubmit} className="border-t border-white/5 p-8 md:border-t-0 md:border-l md:p-12">
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
                  </div>
                </fieldset>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button type="submit" className="pf-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
                    Request a call
                  </button>
                  <p className="text-[12px] text-[#A7AFB8]">We reply within one business day. No medical advice.</p>
                </div>
                {formNote ? (
                  <p className="mt-4 text-sm text-[#7DD3FC]">
                    Received. We will follow up on your work email or WhatsApp. Pharmaflow does not give medical advice.
                  </p>
                ) : null}
              </form>
            </div>
          </Reveal>
        </section>
      </main>
    </LandingChrome>
  );
}
