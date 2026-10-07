"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useScroll } from "motion/react";

import "./pharmaflow-landing.css";

export function LandingChrome({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const atHome = pathname === "/";
  const contactHref = atHome ? "#contact" : "/#contact";
  const homeHref = atHome ? "#top" : "/";

  useEffect(() => {
    const onVis = () => document.documentElement.classList.toggle("pf-paused", document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const nav = [
    { href: atHome ? "#product" : "/#product", label: "Product", id: "product" },
    { href: atHome ? "#platform" : "/#platform", label: "Platform", id: "platform" },
    { href: "/pricing", label: "Pricing", id: "pricing" },
    { href: "/about", label: "About", id: "about" },
  ] as const;

  return (
    <div className="pf-landing scrollbar-themed h-full min-h-0 overflow-x-hidden overflow-y-auto selection:bg-[#5B8CFF]/30">
      <motion.div className="pf-progress" style={{ scaleX: scrollYProgress }} />

      <header
        className={`pf-header fixed inset-x-0 top-0 z-50 border-b ${
          scrolled || menuOpen || !atHome ? "is-scrolled" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-[min(1240px,calc(100%-1.5rem))] items-center justify-between gap-4">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
            <Image src="/brand/logo-mark-clear.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="text-[15px] font-semibold tracking-tight">pharmaflow</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[13px] font-medium text-[#A7AFB8] lg:flex">
            {nav.map((item) => (
              <Link
                key={item.id}
                className={`pf-nav-link ${pathname === item.href ? "text-[#F5F7FA]" : ""}`}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <Link href="/dashboard" prefetch={false} className="hidden text-[13px] font-medium text-[#A7AFB8] hover:text-[#F5F7FA] md:inline">
                Open workspace
              </Link>
            ) : (
              <Link href="/login" prefetch={false} className="hidden text-[13px] font-medium text-[#A7AFB8] hover:text-[#F5F7FA] md:inline">
                Sign in
              </Link>
            )}
            <div className="hidden md:block">
              <Link href={contactHref} className="pf-btn-primary inline-flex rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white">
                Book a call
              </Link>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="flex flex-col gap-1.5">
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "translate-y-[6px] rotate-45" : ""}`} />
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`h-px w-4 bg-white transition ${menuOpen ? "-translate-y-[6px] -rotate-45" : ""}`} />
              </span>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="border-t border-white/5 bg-[#06080B]/95 px-4 py-4 text-[14px] backdrop-blur-xl lg:hidden">
            <div className="mx-auto flex w-[min(1240px,100%)] flex-col gap-3 text-[#A7AFB8]">
              {nav.map((item) => (
                <Link key={item.id} href={item.href} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </Link>
              ))}
              {signedIn ? (
                <Link href="/dashboard" prefetch={false} onClick={() => setMenuOpen(false)}>
                  Open workspace
                </Link>
              ) : (
                <Link href="/login" prefetch={false} onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
              )}
              <Link href={contactHref} className="text-[#5B8CFF]" onClick={() => setMenuOpen(false)}>
                Book a call
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      {children}

      <footer className="border-t border-white/5">
        <div className="mx-auto grid w-[min(1180px,calc(100%-1.5rem))] gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href={homeHref} className="inline-flex items-center gap-2">
              <Image src="/brand/logo-mark-clear.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
              <span className="text-sm font-semibold">pharmaflow</span>
            </Link>
            <p className="mt-4 max-w-[28ch] text-sm text-[#A7AFB8]">
              AI-Powered Pharmaceutical Business Platform. Built by NExora Digital in Nairobi.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
              <li>
                <Link href={atHome ? "#product" : "/#product"}>Command</Link>
              </li>
              <li>
                <Link href={atHome ? "#platform" : "/#platform"}>Platform</Link>
              </li>
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Company</p>
            <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
              <li>
                <Link href="/about">About NExora Digital</Link>
              </li>
              <li>
                <Link href={atHome ? "#faq" : "/#faq"}>FAQ</Link>
              </li>
              <li>
                <Link href={contactHref}>Book a call</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Workspace</p>
            <ul className="mt-4 space-y-2 text-sm text-[#A7AFB8]">
              <li>
                <Link href="/login">Sign in</Link>
              </li>
              <li>Nairobi · Mombasa · Kisumu</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto w-[min(1180px,calc(100%-1.5rem))] border-t border-white/5 py-6 text-sm text-white/35">
          © 2026 Pharmaflow · NExora Digital. Prices in KSh, VAT excl. Not medical advice.
        </div>
      </footer>
    </div>
  );
}
