import type { Metadata } from "next";

import { LandingFonts } from "@/components/landing/LandingShell";
import { PricingPage } from "@/components/landing/PricingPage";
import { getPublicSignedIn } from "@/lib/server/public-session";

export const metadata: Metadata = {
  title: "Pricing — Pharmaflow",
  description:
    "Pharmaflow list prices in Kenyan shillings. Plant, Network, and Group plans. Monthly, VAT exclusive. Book a call — not a self-serve checkout.",
};

export default async function Page() {
  const signedIn = await getPublicSignedIn();
  return (
    <LandingFonts>
      <PricingPage signedIn={signedIn} />
    </LandingFonts>
  );
}
