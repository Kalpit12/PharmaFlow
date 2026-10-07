import type { Metadata } from "next";

import { AboutPage } from "@/components/landing/AboutPage";
import { LandingFonts } from "@/components/landing/LandingShell";
import { getPublicSignedIn } from "@/lib/server/public-session";

export const metadata: Metadata = {
  title: "About NExora Digital — Pharmaflow",
  description:
    "Pharmaflow is built by NExora Digital, a Nairobi studio that designs websites, AI systems, and custom software for Kenyan businesses.",
};

export default async function Page() {
  const signedIn = await getPublicSignedIn();
  return (
    <LandingFonts>
      <AboutPage signedIn={signedIn} />
    </LandingFonts>
  );
}
