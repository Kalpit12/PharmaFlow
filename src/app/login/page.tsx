import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { LandingFonts } from "@/components/landing/LandingShell";
import { ApprovalsMock, CommandCenterMock } from "@/components/landing/LandingMocks";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { isWorkspaceSession } from "@/lib/auth/session";
import { product } from "@/lib/product";
import { getAuthenticatedUser } from "@/lib/server/tenant-context";

import "@/components/landing/pharmaflow-landing.css";

const ASSURANCES = [
  "Tenant-scoped — you only see your company",
  "A person approves every write",
  "Zero model calls on page load",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; email?: string; password?: string; loginHint?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  if (params.email || params.password) {
    const next = new URLSearchParams();
    if (params.callbackUrl) next.set("callbackUrl", params.callbackUrl);
    next.set("loginHint", "native_submit");
    redirect(`/login?${next.toString()}`);
  }

  const loginHint = params.loginHint === "native_submit" ? ("native_submit" as const) : null;
  const devSignInHint =
    process.env.NODE_ENV === "development" && process.env.AUTH_DEV_EMAIL?.trim()
      ? process.env.AUTH_DEV_EMAIL.trim()
      : null;

  if (isWorkspaceSession(session)) {
    // A structurally valid JWT can point at a user removed by a demo reseed.
    // Only redirect after the database-backed identity is confirmed.
    const activeUser = await getAuthenticatedUser().catch(() => null);
    if (activeUser) redirect(callbackUrl);
  }

  return (
    <LandingFonts>
      <main className="pf-landing relative grid min-h-svh overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="pf-noise" aria-hidden="true" />

        {/* ------------------------------------------------------------ */}
        {/*  STAGE                                                        */}
        {/* ------------------------------------------------------------ */}
        <section className="relative hidden overflow-hidden lg:flex lg:flex-col">
          <div className="pf-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="pf-dots pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" aria-hidden="true" />

          <div className="relative z-[2] flex flex-1 flex-col px-10 pt-8 pb-16 xl:px-16">
            <Link href="/" className="inline-flex w-fit items-center gap-2.5">
              <Image src="/brand/logo-mark-clear.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
              <span className="text-[15px] font-semibold tracking-tight">{product.wordmark}</span>
            </Link>

            <div className="pf-hero-copy mt-10 max-w-[34rem] xl:mt-12">
              <span className="pf-eyebrow">Workspace sign-in</span>
              <h2 className="pf-display mt-5 text-[clamp(2.2rem,3.2vw,3.1rem)] leading-[0.98] font-semibold">
                The plant, <span className="font-serif font-normal italic pf-gradient-word">already ranked</span>, before your first coffee.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-[#9AA4B2]">
                Command Center, inventory, materials, procurement, batches, and quality — one picture, waiting for a person to decide.
              </p>
            </div>

            <div className="pf-hero-visual relative mt-10 h-[29rem] w-full max-w-[42rem]">
              <div className="pf-orbit left-[40%] top-[45%] h-[125%] w-[110%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
                <span />
              </div>
              <div className="pf-hero-stage absolute left-0 top-2 w-[30rem]">
                <div className="pf-hero-device relative">
                  <div className="pf-mock-ring rounded-2xl p-px">
                    <CommandCenterMock compact />
                  </div>
                </div>
                <div className="pf-float-chip pf-float-chip-b absolute -top-11 -right-6 max-w-[14rem]">
                  <p className="text-[10px] font-semibold tracking-wide text-[#F2B84B] uppercase">Watch · Inventory</p>
                  <p className="mt-0.5 font-medium">Amoxicillin expiry window</p>
                </div>
              </div>
              <div className="pf-float-chip-c absolute left-[23rem] top-[9.5rem] w-[19rem]" style={{ animation: "none" }}>
                <div className="pf-glass rounded-2xl p-px">
                  <div className="[&>div]:!border-0 [&>div]:!bg-transparent">
                    <ApprovalsMock />
                  </div>
                </div>
              </div>
            </div>

          </div>
          <p className="absolute bottom-8 left-10 z-[2] text-[11px] font-medium tracking-[0.14em] text-white/35 uppercase xl:left-16">
            Controlled access · Tenant-scoped data · Not medical advice
          </p>
        </section>

        {/* ------------------------------------------------------------ */}
        {/*  FORM                                                         */}
        {/* ------------------------------------------------------------ */}
        <section className="relative flex flex-col justify-center bg-[#0A0D11] px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
          <div className="pf-hero-wash pointer-events-none absolute inset-0 opacity-70 lg:hidden" aria-hidden="true" />
          <div className="pf-grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />

          <div className="relative z-[2] mx-auto w-full max-w-[26rem]">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <Image src="/brand/logo-mark-clear.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
                <span className="text-[15px] font-semibold tracking-tight">{product.wordmark}</span>
              </Link>
              <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-[#9AA4B2] hover:text-[#F4F7FB]">
                <ArrowLeft className="size-3.5" strokeWidth={2} /> Back
              </Link>
            </div>

            <div className="pf-glass rounded-3xl p-7 sm:p-9">
              <div className="flex items-center justify-between gap-4">
                <p className="pf-kicker">Workspace</p>
                <span className="pf-live-pill">Secure</span>
              </div>
              <h1 className="pf-display mt-3 text-3xl font-semibold sm:text-[2.1rem]">Sign in</h1>
              <p className="mt-2 text-[15px] text-[#9AA4B2]">Use your {product.name} account to continue.</p>

              <div className="mt-8">
                <LoginForm callbackUrl={callbackUrl} loginHint={loginHint} devSignInHint={devSignInHint} />
              </div>

              <ul className="mt-8 space-y-2.5 border-t border-white/8 pt-6 text-[13px] text-[#9AA4B2]">
                {ASSURANCES.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-[#5EEAD4]" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#9AA4B2]">
              <Link href="/" className="hidden items-center gap-1.5 hover:text-[#F4F7FB] lg:inline-flex">
                <ArrowLeft className="size-3.5" strokeWidth={2} /> Back to {product.wordmark}
              </Link>
              <span>
                No account yet?{" "}
                <Link href="/#contact" className="font-medium text-[#7DD3FC] hover:text-[#F4F7FB]">
                  Book a call
                </Link>
              </span>
            </div>
          </div>
        </section>
      </main>
    </LandingFonts>
  );
}
