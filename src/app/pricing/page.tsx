import type { Metadata } from "next";

import { LandingFonts } from "@/components/landing/LandingShell";
import { PricingPage } from "@/components/landing/PricingPage";

export const metadata: Metadata = {
  title: "Pricing — Pharmaflow",
  description:
    "Pharmaflow list prices in Kenyan shillings. Plant, Network, and Group plans. Monthly, VAT exclusive. Book a call — not a self-serve checkout.",
};

export default function Page() {
  return (
    <LandingFonts>
      <PricingPage />
    </LandingFonts>
  );
}
