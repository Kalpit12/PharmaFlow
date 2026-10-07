import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { getPublicSignedIn } from "@/lib/server/public-session";

const LandingShell = dynamic(
  () => import("@/components/landing/LandingShell").then((module) => module.LandingShell),
  {
    loading: () => <div aria-busy="true" aria-label="Loading" className="min-h-svh bg-[#0A0D11]" />,
  },
);

export const metadata: Metadata = {
  title: "Pharmaflow — AI-Powered Pharmaceutical Business Platform",
  description:
    "Pharmaflow is the operations system for pharmaceutical manufacturers, distributors, and medical suppliers in Kenya. Command, inventory, materials, procurement, and execution in one workspace.",
};

export default async function Home() {
  const signedIn = await getPublicSignedIn();
  return <LandingShell signedIn={signedIn} />;
}
