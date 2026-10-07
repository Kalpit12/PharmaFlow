"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Building2, Check, ChevronDown, Shield, ShieldCheck, UserCheck } from "lucide-react";

import CountUp from "@/components/react-bits/CountUp";

import { FAQ, MODULES, QUOTES, ROTATING, TRUST } from "./landing-copy";
import {
  ApprovalsMock,
  AuditMock,
  BatchStatesMock,
  CommandCenterMock,
  ExpiryHeatMock,
  MrpNetMock,
  OpsLog,
  SupplyChainMock,
  TraceMock,
} from "./LandingMocks";
import { LandingChrome } from "./LandingChrome";
import { LandingButton, LandingInput, LandingSelect, LandingTextarea } from "./LandingFormControls";
import { LandingPricingPlans } from "./LandingPricingPlans";
import { LandingWorkflow } from "./LandingWorkflow";
import { Reveal } from "./Reveal";

import "./pharmaflow-landing.css";

const OLD_WAY = [
  "Twelve logins before the first coffee",
  "Four spreadsheets that disagree on stock",
  "Expiry found by walking the shelf",
  "RFQs living in WhatsApp threads",
  "Batch holds nobody downstream can see",
  "Board numbers rebuilt every quarter",
];

const NEW_WAY = [
  { domain: "Command", text: "One ranked picture: health, attention, destination" },
  { domain: "Inventory", text: "Every lot named, dated, and in its expiry window" },
  { domain: "Materials", text: "Net requirement vs plan — before the line stops" },
  { domain: "Procurement", text: "Shortage → RFQ → award → receipt on one trail" },
  { domain: "Quality", text: "Holds and exceptions visible to production and sales" },
  { domain: "Board", text: "KSh figures that reconcile to the floor" },
];

const PRINCIPLES = [
  { icon: Building2, title: "Tenant isolation", body: "Each company in its own workspace. No shared tables, no cross-tenant reads." },
  { icon: UserCheck, title: "Human approval", body: "A person signs before inventory, buying, or quality status changes." },
  { icon: Shield, title: "No autonomous buying", body: "Drafts and trails — never auto-pay, auto-order, or auto-message suppliers." },
  { icon: ShieldCheck, title: "Not medical advice", body: "Business and operations data only. No clinical claims, ever." },
];

const STEPS = [
  { n: "01", title: "Book a call", body: "Tell us what you do, the site, and the pressure you want on the table." },
  { n: "02", title: "Plant walkthrough", body: "We map inventory, materials, and the buy desk against how you already operate." },
  { n: "03", title: "Scoped workspace", body: "A tenant shaped to your plant. List pricing is public; implementation is scoped after the walkthrough." },
];

export function PharmaflowLanding({ signedIn = false }: { signedIn?: boolean }) {
  const reduced = useReducedMotion();
  const [formNote, setFormNote] = useState(false);
  const [word, setWord] = useState(0);
  const [rotated, setRotated] = useState(false);
  const [prompt, setPrompt] = useState("");
  const heroRef = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setRotated(true);
      setWord((index) => (index + 1) % ROTATING.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reduced]);

  // The first word is server-rendered; `useReducedMotion` is null on the server,
  // so it must not drive the initial style or hydration mismatches.
  const animateEntry = rotated && !reduced;

  function onHeroPointer(event: ReactPointerEvent<HTMLElement>) {
    if (reduced) return;
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    if (frame.current != null) return;
    frame.current = window.requestAnimationFrame(() => {
      el.style.setProperty("--px", `${px.toFixed(1)}%`);
      el.style.setProperty("--py", `${py.toFixed(1)}%`);
      frame.current = null;
    });
  }

  function onBentoPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".pf-bento");
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    tile.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    tile.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }

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
    <LandingChrome signedIn={signedIn}>
      <div className="pf-noise" aria-hidden="true" />
      <main id="top" className="relative z-[2] overflow-x-hidden">
        {/* ------------------------------------------------------------ */}
        {/*  HERO                                                         */}
        {/* ------------------------------------------------------------ */}
        <section ref={heroRef} onPointerMove={onHeroPointer} className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden pt-16">
          <div className="pf-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="pf-dots pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[#06080B]" aria-hidden="true" />

          <div className="relative mx-auto grid w-[min(1280px,calc(100%-1.5rem))] items-center gap-12 pt-14 pb-16 md:pt-20 lg:pb-24 xl:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] xl:gap-12 xl:pb-44">
            <div className="pf-hero-copy relative mx-auto flex w-full min-w-0 max-w-[40rem] flex-col items-center text-center xl:mx-0 xl:items-start xl:text-left">
              <span className="pf-eyebrow">Pharmaceutical operations · Kenya</span>

              <h1 className="pf-display mt-6 text-[clamp(2.75rem,6.4vw,5.4rem)] leading-[0.96] font-semibold xl:text-[clamp(3.25rem,4.6vw,4.5rem)]">
                The <span className="font-serif font-normal italic pf-gradient-word">operating system</span> for pharmaceutical{" "}
                <span className="relative inline-flex min-h-[1em] min-w-[11ch] justify-center overflow-hidden align-baseline xl:justify-start">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={ROTATING[word]}
                      initial={animateEntry ? { y: 14, opacity: 0, filter: "blur(4px)" } : false}
                      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                      exit={animateEntry ? { y: -14, opacity: 0, filter: "blur(4px)" } : undefined}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      className="font-serif font-normal italic text-[#7DD3FC]"
                    >
                      {ROTATING[word]}.
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h1>

              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[#9AA4B2] md:text-xl">
                Command, inventory, materials, procurement, batches, and quality in one Kenyan workspace. Pharmaflow prepares the
                morning picture. A person still approves every write.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 xl:justify-start">
                <a href="#contact" className="pf-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold text-white">
                  Book a call
                  <ArrowRight className="size-4" strokeWidth={2} />
                </a>
                <a href="#product" className="pf-btn-ghost inline-flex items-center rounded-xl px-5 py-3 text-[15px] font-medium">
                  See the product
                </a>
              </div>

              <form onSubmit={onPrompt} className="pf-prompt mt-8 w-full max-w-xl text-left">
                <LandingInput
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the pressure on your plant…"
                  aria-label="Describe the pressure on your plant"
                />
                <LandingButton type="submit" className="pf-btn-primary shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white">
                  Continue
                </LandingButton>
              </form>

              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-medium text-[#9AA4B2] xl:justify-start">
                <li className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-[#5EEAD4]" strokeWidth={2.5} /> Zero model calls on page load
                </li>
                <li className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-[#5EEAD4]" strokeWidth={2.5} /> Tenant-scoped
                </li>
                <li className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-[#5EEAD4]" strokeWidth={2.5} /> Priced in KSh
                </li>
              </ul>
            </div>

            <div className="pf-hero-visual relative mx-auto w-full min-w-0 max-w-[52rem] xl:max-w-none">
              <div className="pf-orbit left-1/2 top-1/2 hidden h-[115%] w-[115%] -translate-x-1/2 -translate-y-1/2 md:block" aria-hidden="true">
                <span />
              </div>
              <div className="pf-orbit pf-orbit-2 left-1/2 top-1/2 hidden h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden="true">
                <span />
              </div>

              <div className="pf-hero-stage relative px-2 md:px-6">
                <div className="pf-hero-device relative">
                  <div className="pf-mock-ring rounded-2xl p-px">
                    <CommandCenterMock />
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-0 hidden md:block">
                  <div className="pf-float-chip absolute -top-9 left-2 max-w-[13.5rem] lg:-left-2">
                    <p className="text-[10px] font-semibold tracking-wide text-[#F26D6D] uppercase">High · Materials</p>
                    <p className="mt-0.5 font-medium">Foil net-short vs plan</p>
                  </div>
                  <div className="pf-float-chip pf-float-chip-b absolute -top-11 right-2 max-w-[14rem] lg:-right-2">
                    <p className="text-[10px] font-semibold tracking-wide text-[#F2B84B] uppercase">Watch · Inventory</p>
                    <p className="mt-0.5 font-medium">Amoxicillin expiry window</p>
                  </div>
                </div>

                <div className="pf-float-chip-c absolute -bottom-40 -left-4 hidden w-[19rem] xl:block" style={{ animation: "none" }}>
                  <div className="pf-glass rounded-2xl p-px">
                    <TraceMock compact className="!border-0 !bg-transparent" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  TICKER                                                       */}
        {/* ------------------------------------------------------------ */}
        <section className="relative border-y border-white/5 bg-[#0A0D11]/90 py-5">
          <div className="pf-marquee">
            <div className="pf-marquee-track">
              {[...MODULES, ...MODULES].map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
              ))}
            </div>
          </div>
          <div className="mx-auto mt-4 flex w-[min(1240px,calc(100%-1.5rem))] flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] font-medium tracking-[0.14em] text-white/35 uppercase">
            {TRUST.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  VERSUS                                                       */}
        {/* ------------------------------------------------------------ */}
        <section className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="pf-kicker">Monday morning, two ways</p>
            <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">
              Most plants start the week <span className="font-serif font-normal italic text-[#9AA4B2]">hunting</span>. Yours could start it{" "}
              <span className="font-serif font-normal italic pf-gradient-word">knowing</span>.
            </h2>
          </Reveal>

          <Reveal className="mt-14 grid gap-4 lg:grid-cols-2">
            <div className="pf-versus-old relative overflow-hidden rounded-2xl border border-white/8 p-7 md:p-9">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-white/35 uppercase">Without Pharmaflow</p>
              <ul className="mt-6 space-y-3.5 text-[15px] text-[#9AA4B2]">
                {OLD_WAY.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#F26D6D]/60" aria-hidden="true" />
                    <span className="pf-strike">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pf-versus-new pf-glow-ring relative overflow-hidden rounded-2xl border border-white/10 p-7 md:p-9">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5EEAD4] uppercase">With Pharmaflow</p>
                <span className="pf-live-pill">One picture</span>
              </div>
              <ul className="mt-6 space-y-3.5 text-[15px]">
                {NEW_WAY.map((item) => (
                  <li key={item.domain} className="flex items-start gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-[#5EEAD4]" strokeWidth={2.5} />
                    <span>
                      <span className="mr-2 text-[11px] font-semibold tracking-wide text-[#7DD3FC] uppercase">{item.domain}</span>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  PRODUCT BENTO                                                */}
        {/* ------------------------------------------------------------ */}
        <section id="product" className="relative">
          <div className="pf-hairline" />
          <div className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
            <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <p className="pf-kicker">Product</p>
                <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">
                  A control room — <span className="font-serif font-normal italic text-[#9AA4B2]">not another dashboard template.</span>
                </h2>
                <p className="mt-4 max-w-2xl text-lg text-[#9AA4B2]">
                  Built for manufacturers, distributors, and medical suppliers who need command, supply chain, and human control in
                  the same tenant.
                </p>
              </div>
              <a href="/pricing" className="pf-btn-ghost inline-flex shrink-0 items-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-medium md:self-auto">
                Plans in KSh <ArrowRight className="size-4" strokeWidth={2} />
              </a>
            </Reveal>

            <Reveal className="mt-14">
              <div onPointerMove={onBentoPointer} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <article className="pf-bento flex flex-col p-6 md:col-span-2 lg:row-span-2">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#7DD3FC] uppercase">Command Center</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">The picture the MD opens on Monday.</h3>
                  <p className="mt-3 max-w-xl text-[15px] text-[#9AA4B2]">
                    Business health, ranked attention, and a path into the workspace that owns the problem. Nothing to assemble.
                  </p>
                  <div className="pf-bento-visual my-6 flex flex-1 flex-col justify-center">
                    <div className="pf-mock-ring rounded-2xl p-px">
                      <CommandCenterMock />
                    </div>
                  </div>
                  <div className="grid gap-3 text-[12px] text-[#9AA4B2] sm:grid-cols-3">
                    {[
                      ["Health", "Revenue, RFQs, lots at risk"],
                      ["Attention", "Ranked by severity and domain"],
                      ["Destination", "One click into the owning workspace"],
                    ].map(([label, body]) => (
                      <div key={label} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                        <p className="text-[11px] font-semibold tracking-wide text-[#F4F7FB] uppercase">{label}</p>
                        <p className="mt-1 leading-snug">{body}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#F2B84B] uppercase">Inventory</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Expiry is a named lot.</h3>
                  <div className="pf-bento-visual mt-5">
                    <ExpiryHeatMock />
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5B8CFF] uppercase">Materials · MRP</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Net against the plan.</h3>
                  <div className="pf-bento-visual mt-5">
                    <MrpNetMock />
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#D6A85F] uppercase">Procurement</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Shortage to receipt, still gated.</h3>
                  <div className="pf-bento-visual mt-5">
                    <SupplyChainMock />
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5EEAD4] uppercase">Batches · Quality</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Holds, releases, exceptions.</h3>
                  <div className="pf-bento-visual mt-5">
                    <BatchStatesMock />
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#7DD3FC] uppercase">Traceability</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Lot → batch → order, honestly.</h3>
                  <div className="pf-bento-visual mt-5">
                    <TraceMock />
                  </div>
                </article>

                <article className="pf-bento p-6">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9AA4B2] uppercase">Governance</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Who did what, when.</h3>
                  <div className="pf-bento-visual mt-5">
                    <AuditMock />
                  </div>
                </article>

                <article className="pf-bento flex flex-col justify-between p-6">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5B8CFF] uppercase">Explain on request</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight">AI that explains. Never decides.</h3>
                    <p className="mt-3 text-[15px] text-[#9AA4B2]">
                      Ordinary screens load with zero model calls. Explain is one explicit request that reads ranked facts and
                      cannot approve, schedule, buy, or release.
                    </p>
                  </div>
                  <p className="mt-6 font-mono text-[11px] text-white/35">POST /api/intelligence/explain · max 1 call</p>
                </article>

                <article className="pf-bento flex flex-col justify-between p-6">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5EEAD4] uppercase">Kenya-native</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight">Board figures in KSh.</h3>
                    <p className="mt-3 text-[15px] text-[#9AA4B2]">
                      Pricing, reporting, and the demo tenant are built for Kenyan pharmaceutical operations — Nairobi, Mombasa,
                      Kisumu.
                    </p>
                  </div>
                  <p className="mt-6 text-4xl font-semibold tabular-nums tracking-tight">
                    <span className="text-lg font-medium text-[#9AA4B2]">KSh </span>423M
                  </p>
                </article>
              </div>
            </Reveal>

            <Reveal className="mt-16">
              <LandingWorkflow />
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  LIVE OPERATIONS                                              */}
        {/* ------------------------------------------------------------ */}
        <section id="platform" className="relative border-y border-white/5 bg-[#0A0D11]">
          <div className="pf-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <Reveal className="relative mx-auto grid w-[min(1240px,calc(100%-1.5rem))] items-center gap-12 py-24 md:py-32 lg:grid-cols-2">
            <div>
              <p className="pf-kicker">Live operations</p>
              <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">
                The morning stream, <span className="font-serif font-normal italic pf-gradient-word">already ranked.</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[#9AA4B2]">
                Attention lands with domain, severity, and a destination. No twelve-login hunt. No invented clinical claims —
                business and operations data only.
              </p>
              <ul className="mt-8 space-y-3 text-[15px]">
                {["Zero model calls on ordinary page load", "Tenant-scoped workspaces", "Human approval before inventory, buying, or quality writes"].map(
                  (item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full border border-[#5EEAD4]/40 bg-[#5EEAD4]/10">
                        <Check className="size-3 text-[#5EEAD4]" strokeWidth={3} />
                      </span>
                      <span className="text-[#F4F7FB]/90">{item}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div>
              <OpsLog />
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  HUMAN CONTROL                                                */}
        {/* ------------------------------------------------------------ */}
        <section id="control" className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
          <Reveal className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div>
              <p className="pf-kicker">Control</p>
              <h2 className="pf-display mt-4 text-4xl font-semibold leading-[1.02] md:text-6xl">
                Agents <span className="font-serif font-normal italic text-[#9AA4B2]">prepare.</span>
                <br />
                People <span className="font-serif font-normal italic pf-gradient-word">decide.</span>
              </h2>
              <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-[#9AA4B2]">
                Execution and approvals keep a person on every write. Pharmaflow drafts the RFQ, nets the material, flags the lot
                — and then waits. We do not auto-buy, message suppliers, or pay anyone.
              </p>
              <div className="mt-10 grid gap-5 sm:grid-cols-2">
                {PRINCIPLES.map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.03]">
                      <item.icon className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#9AA4B2]">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pf-glass rounded-2xl p-1">
              <ApprovalsMock />
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  PROOF                                                        */}
        {/* ------------------------------------------------------------ */}
        <section id="proof" className="relative border-y border-white/5 bg-[#0A0D11]">
          <Reveal className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
            <div className="max-w-2xl">
              <p className="pf-kicker">Why Pharmaflow</p>
              <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">Built for how Kenyan plants actually run.</h2>
            </div>

            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <div className="pf-stat">
                <p className="text-5xl font-semibold tabular-nums tracking-tight text-[#F4F7FB] md:text-6xl">
                  <CountUp to={1} duration={1.2} />
                </p>
                <p className="mt-3 text-sm text-[#9AA4B2]">operating picture across command, inventory, materials, and the buy</p>
              </div>
              <div className="pf-stat">
                <p className="text-5xl font-semibold tabular-nums tracking-tight text-[#F4F7FB] md:text-6xl">
                  <CountUp to={20} duration={1.4} />
                  <span className="text-[#7DD3FC]">+</span>
                </p>
                <p className="mt-3 text-sm text-[#9AA4B2]">workspaces in one tenant — from Daily Review to quality</p>
              </div>
              <div className="pf-stat">
                <p className="text-5xl font-semibold tabular-nums tracking-tight text-[#F4F7FB] md:text-6xl">
                  <CountUp to={0} duration={0.8} />
                </p>
                <p className="mt-3 text-sm text-[#9AA4B2]">model calls on page load. Explain is one explicit request</p>
              </div>
              <div className="pf-stat">
                <p className="text-5xl font-semibold tracking-tight text-[#F4F7FB] md:text-6xl">KSh</p>
                <p className="mt-3 text-sm text-[#9AA4B2]">native pricing and board figures for Kenyan companies</p>
              </div>
            </div>

            <div className="mt-20 grid gap-4 md:grid-cols-3">
              {QUOTES.map((item) => (
                <blockquote key={item.city} className="pf-surface flex h-full flex-col rounded-2xl p-7">
                  <span className="pf-quote-mark" aria-hidden="true">
                    &ldquo;
                  </span>
                  <p className="mt-4 flex-1 font-serif text-[24px] leading-[1.25] text-[#F4F7FB]/92 italic">{item.quote}</p>
                  <footer className="mt-6 text-sm text-[#9AA4B2]">
                    {item.role} · {item.city}
                    <span className="mt-1 block text-[11px] tracking-wide text-white/35 uppercase">Illustrative operator voice</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  HOW IT WORKS                                                 */}
        {/* ------------------------------------------------------------ */}
        <section className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
          <Reveal>
            <p className="pf-kicker">How it works</p>
            <h2 className="pf-display mt-4 max-w-xl text-4xl font-semibold md:text-5xl">From call to scoped workspace.</h2>
            <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
              <span className="pf-workflow-line pointer-events-none absolute top-7 right-[12%] left-[12%] hidden h-px md:block" aria-hidden="true" />
              {STEPS.map((step) => (
                <li key={step.n} className="pf-surface relative rounded-2xl p-7">
                  <span className="relative z-[1] inline-grid size-14 place-items-center rounded-full border border-[#7DD3FC]/30 bg-[#0E1216] font-mono text-[13px] tracking-widest text-[#7DD3FC]">
                    {step.n}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#9AA4B2]">{step.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  PRICING                                                      */}
        {/* ------------------------------------------------------------ */}
        <section id="pricing" className="relative border-t border-white/5 bg-[#0A0D11]/60">
          <Reveal className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
            <div className="max-w-2xl">
              <p className="pf-kicker">Pricing</p>
              <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">
                Transparent list prices. <span className="font-serif font-normal italic pf-gradient-word">In Kenyan shillings.</span>
              </h2>
              <p className="mt-4 max-w-xl text-lg text-[#9AA4B2]">
                Plant, Network, and Group — monthly, VAT exclusive. Every plan ends in a call, not a checkout.
              </p>
            </div>
            <LandingPricingPlans contactHref="#contact" />
            <a href="/pricing" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#7DD3FC] hover:text-[#F4F7FB]">
              See pricing <ArrowRight className="size-4" strokeWidth={2} />
            </a>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  FAQ                                                          */}
        {/* ------------------------------------------------------------ */}
        <section id="faq" className="border-t border-white/5">
          <Reveal className="mx-auto w-[min(820px,calc(100%-1.5rem))] py-24 md:py-32">
            <div className="text-center">
              <p className="pf-kicker">FAQ</p>
              <h2 className="pf-display mt-4 text-4xl font-semibold md:text-5xl">Answers before the call.</h2>
            </div>
            <div className="pf-faq mt-12 divide-y divide-white/8 border-y border-white/8">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-4 text-left text-[17px] font-medium">
                    {item.q}
                    <ChevronDown className="pf-faq-chevron size-5 shrink-0 text-[#9AA4B2] transition" strokeWidth={1.5} />
                  </summary>
                  <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[#9AA4B2]">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  CTA                                                          */}
        {/* ------------------------------------------------------------ */}
        <section className="relative overflow-hidden">
          <Reveal className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-10">
            <div className="pf-glow-ring relative overflow-hidden rounded-3xl border border-white/10 px-6 py-16 text-center md:py-20">
              <div className="pf-aurora pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
              <div className="pf-dots pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative">
                <p className="pf-kicker">Ready when you are</p>
                <h2 className="pf-display mt-4 text-3xl font-semibold md:text-5xl">
                  Put the plant on <span className="font-serif font-normal italic pf-gradient-word">one picture.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-lg text-[#9AA4B2]">
                  Book a call. We will walk the site and scope a Kenyan workspace — billed in KSh.
                </p>
                <a href="#contact" className="pf-btn-primary mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold text-white">
                  Book a call <ArrowRight className="size-4" strokeWidth={2} />
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  CONTACT                                                      */}
        {/* ------------------------------------------------------------ */}
        <section id="contact" className="mx-auto w-[min(1240px,calc(100%-1.5rem))] py-24 md:py-32">
          <Reveal>
            <div className="pf-glass overflow-hidden rounded-3xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="relative p-8 md:p-12">
                <div className="pf-dots pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
                <div className="relative">
                  <Image
                    src="/brand/logo-full-clear.png"
                    alt="pharmaflow — AI-Powered Pharmaceutical Business Platform"
                    width={320}
                    height={106}
                    className="h-12 w-auto max-w-full object-contain object-left"
                  />
                  <h2 className="pf-display mt-8 text-3xl font-semibold md:text-4xl">Book a call</h2>
                  <p className="mt-4 max-w-[40ch] text-lg text-[#9AA4B2]">
                    A short intake so we arrive prepared — who you are, what the company does, and the pressure you want to talk
                    through.
                  </p>
                  <ul className="mt-8 space-y-3 text-sm text-[#9AA4B2]">
                    {[
                      "30–45 minutes with an operations lead",
                      "We cover your plant picture, not a product pitch deck",
                      "No medical advice — commercial and ops only",
                      "Follow-up on work email or WhatsApp",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <Check className="mt-1 size-3.5 shrink-0 text-[#5EEAD4]" strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <form id="contact-form" onSubmit={onSubmit} className="border-t border-white/5 bg-[#0A0D11]/60 p-8 md:border-t-0 md:border-l md:p-12">
                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">You</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      Full name
                      <LandingInput required name="name" autoComplete="name" className="pf-field" />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-[12px] font-medium text-[#9AA4B2]">
                        Work email
                        <LandingInput required type="email" name="email" autoComplete="email" className="pf-field" />
                      </label>
                      <label className="block text-[12px] font-medium text-[#9AA4B2]">
                        Phone or WhatsApp
                        <LandingInput required type="tel" name="phone" autoComplete="tel" placeholder="+254…" className="pf-field" />
                      </label>
                    </div>
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      Your role
                      <LandingSelect required name="role" defaultValue="" className="pf-field">
                        <option value="" disabled>
                          Select role
                        </option>
                        <option value="md-owner">MD / Owner</option>
                        <option value="operations">Operations / Plant</option>
                        <option value="procurement">Procurement / Supply chain</option>
                        <option value="finance">Finance / Commercial</option>
                        <option value="it">IT / Systems</option>
                        <option value="other">Other</option>
                      </LandingSelect>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">Company</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      Company name
                      <LandingInput required name="company" autoComplete="organization" className="pf-field" />
                    </label>
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      What does your company do?
                      <LandingSelect required name="companyType" defaultValue="" className="pf-field">
                        <option value="" disabled>
                          Select type
                        </option>
                        <option value="manufacturer">Pharmaceutical manufacturer</option>
                        <option value="distributor">Distributor / wholesaler</option>
                        <option value="medical-supplier">Medical / hospital supplier</option>
                        <option value="group">Multi-site group / holding</option>
                        <option value="other">Other (tell us below)</option>
                      </LandingSelect>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-[12px] font-medium text-[#9AA4B2]">
                        Primary site / city
                        <LandingInput required name="site" placeholder="e.g. Nairobi" className="pf-field" />
                      </label>
                      <label className="block text-[12px] font-medium text-[#9AA4B2]">
                        Sites in scope
                        <LandingSelect required name="sites" defaultValue="" className="pf-field">
                          <option value="" disabled>
                            Select
                          </option>
                          <option value="1">1 site</option>
                          <option value="2-5">2–5 sites</option>
                          <option value="6+">6+ sites</option>
                        </LandingSelect>
                      </label>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="pf-form-group">
                  <legend className="pf-form-legend">Call focus</legend>
                  <div className="grid gap-4">
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      What is the main pressure right now?
                      <LandingSelect required name="pressure" defaultValue="" className="pf-field">
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
                      </LandingSelect>
                    </label>
                    <label className="block text-[12px] font-medium text-[#9AA4B2]">
                      Anything we should know before the call?
                      <LandingTextarea
                        name="message"
                        rows={3}
                        placeholder="Systems you use today, ERP constraints, who else should join…"
                        className="pf-field resize-y"
                      />
                    </label>
                  </div>
                </fieldset>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LandingButton type="submit" className="pf-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
                    Request a call
                  </LandingButton>
                  <p className="text-[12px] text-[#9AA4B2]">We reply within one business day. No medical advice.</p>
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
