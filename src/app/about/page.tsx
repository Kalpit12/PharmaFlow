import type { Metadata } from "next";

import { AboutPage } from "@/components/landing/AboutPage";
import { LandingFonts } from "@/components/landing/LandingShell";

export const metadata: Metadata = {
  title: "About NExora Digital — Pharmaflow",
  description:
    "Pharmaflow is built by NExora Digital, a Nairobi studio that designs websites, AI systems, and custom software for Kenyan businesses.",
};

export default function Page() {
  return (
    <LandingFonts>
      <AboutPage />
    </LandingFonts>
  );
}
