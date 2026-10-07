"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { safeCallbackUrl } from "@/lib/auth/callback-url";

type Status = "idle" | "submitting" | "invalid" | "inactive" | "tenant_inactive" | "unavailable";

type LoginFormProps = {
  callbackUrl: string;
  /** Shown when the browser submitted the form before React loaded (GET with query params). */
  loginHint?: "native_submit" | null;
  /** Local dev only — matches AUTH_DEV_EMAIL from seed. */
  devSignInHint?: string | null;
};

export function LoginForm({ callbackUrl, loginHint, devSignInHint }: LoginFormProps) {
  const [clientReady, setClientReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitting = status === "submitting";
  const destination = safeCallbackUrl(callbackUrl);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("email") || params.has("password")) {
      params.delete("email");
      params.delete("password");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, []);

  const hintMessage =
    loginHint === "native_submit"
      ? "The page reloaded before sign-in was ready. Wait a moment, enter your credentials again, then press Sign in."
      : null;

  const message =
    status === "invalid"
      ? "Invalid email or password."
      : status === "inactive"
        ? "This account is inactive."
        : status === "tenant_inactive"
          ? "This workspace is unavailable."
          : status === "unavailable"
            ? "Sign-in is temporarily unavailable. Please try again in a moment."
            : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientReady || submitting) return;
    setStatus("submitting");

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: destination,
    });

    // Auth.js reports `ok: true` even when the callback itself failed
    // (e.g. database unreachable) — the failure surfaces in `error`.
    if (result?.ok && !result.error) {
      // Full navigation so the session cookie is included before proxy-protected routes load.
      window.location.assign(destination);
      return;
    }

    const code = result?.code ?? result?.error ?? "";
    if (code.includes("inactive_account")) setStatus("inactive");
    else if (code.includes("inactive_tenant")) setStatus("tenant_inactive");
    else if (code === "Configuration" || code === "CallbackRouteError") setStatus("unavailable");
    else setStatus("invalid");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {devSignInHint ? (
        <p className="rounded-xl border border-[#7DD3FC]/20 bg-[#7DD3FC]/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#9AA4B2]">
          Local demo account:{" "}
          <span className="font-medium text-[#F4F7FB]">{devSignInHint}</span>
          {" · "}
          Password is in your <code className="text-[11px] text-[#7DD3FC]">.env</code> (
          <code className="text-[11px] text-[#7DD3FC]">AUTH_DEV_PASSWORD</code>).
        </p>
      ) : null}

      {hintMessage ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-[#F2B84B]/30 bg-[#F2B84B]/10 px-3.5 py-3 text-[13px] text-[#F4F7FB]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#F2B84B]" strokeWidth={2} />
          {hintMessage}
        </p>
      ) : null}
      <label htmlFor="email" className="block text-[12px] font-medium text-[#9AA4B2]">
        Work email
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting || !clientReady}
          placeholder="you@company.co.ke"
          className="pf-field h-12 disabled:opacity-60"
          aria-invalid={status === "invalid" || undefined}
        />
      </label>

      <label htmlFor="password" className="block text-[12px] font-medium text-[#9AA4B2]">
        Password
        <span className="relative mt-2 block">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting || !clientReady}
            placeholder="••••••••••"
            className="pf-field !mt-0 h-12 pr-12 disabled:opacity-60"
            aria-invalid={status === "invalid" || undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-[0.6rem] text-[#9AA4B2] transition hover:text-[#F4F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/40"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            disabled={submitting}
          >
            {showPassword ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
          </button>
        </span>
      </label>

      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-[#F26D6D]/30 bg-[#F26D6D]/10 px-3.5 py-3 text-[13px] text-[#F4F7FB]"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#F26D6D]" strokeWidth={2} />
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !clientReady}
        className="pf-btn-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {!clientReady ? (
          <>
            <Loader2 className="size-4 animate-spin" strokeWidth={2} /> Preparing sign-in…
          </>
        ) : submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" strokeWidth={2} /> Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight className="size-4" strokeWidth={2} />
          </>
        )}
      </button>
    </form>
  );
}
