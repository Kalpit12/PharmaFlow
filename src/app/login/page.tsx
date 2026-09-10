import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLockup } from "@/components/brand/BrandLogo";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar px-8 py-10 text-sidebar-foreground lg:flex">
        <div>
          <BrandLockup priority />
          <p className="mt-8 max-w-[18rem] text-sm leading-relaxed text-sidebar-foreground/70">
            Sign in to the workspace. Production, materials, procurement and inventory stay in one operating view.
          </p>
        </div>
        <p className="text-[11px] text-sidebar-foreground/40">Controlled access · tenant-scoped data</p>
      </aside>
      <div className="flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLockup priority />
          </div>
          <p className="label-context">Workspace</p>
          <h1 className="mt-2 text-xl font-medium tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use your Pharmaflow account to continue.</p>
          <div className="mt-8 border-t border-border pt-6">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </div>
      </div>
    </main>
  );
}
