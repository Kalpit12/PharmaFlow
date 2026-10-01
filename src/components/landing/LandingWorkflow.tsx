"use client";

import { useEffect, useRef, useState } from "react";

import { WORKFLOW } from "./landing-copy";

export function LandingWorkflow() {
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: number | null = null;
    const stop = () => {
      if (timer == null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer != null || document.hidden) return;
      timer = window.setInterval(() => {
        setActive((index) => (index + 1) % WORKFLOW.length);
      }, 4000);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.35 },
    );
    io.observe(root);

    const onVis = () => {
      if (document.hidden) stop();
      else if (root.getBoundingClientRect().top < window.innerHeight && root.getBoundingClientRect().bottom > 0) {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={rootRef} className="pf-workflow relative overflow-hidden rounded-2xl border border-white/8 bg-[#0F1318] p-6 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#5B8CFF] uppercase">Agents prepare · people decide</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">From shortage to release, on one trail.</h3>
        </div>
        <p className="pf-live-pill hidden sm:inline-flex">5 steps · human-gated</p>
      </div>

      <ol className="relative mt-10 grid gap-3 sm:grid-cols-5">
        <span className="pf-workflow-line pointer-events-none absolute top-[1.55rem] right-[10%] left-[10%] hidden h-px sm:block" aria-hidden="true" />
        {WORKFLOW.map((step, index) => {
          const isActive = index === active;
          const isDone = index < active;
          return (
            <li key={step.id} className="relative z-[1] flex flex-col items-center text-center">
              <button
                type="button"
                className={`pf-node pf-node-${step.tone} ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                onClick={() => setActive(index)}
                aria-pressed={isActive}
              >
                <span className="font-mono text-[10px] tracking-widest">{String(index + 1).padStart(2, "0")}</span>
              </button>
              <p className="mt-3 text-sm font-semibold">{step.label}</p>
              <p className="mt-1 text-[12px] text-[#A7AFB8]">{step.detail}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-[#A7AFB8]">
        {WORKFLOW[active].label}: {WORKFLOW[active].detail}. Pharmaflow drafts the next move. A manager still signs
        before anything writes to inventory, suppliers, or quality status.
      </p>
    </div>
  );
}
