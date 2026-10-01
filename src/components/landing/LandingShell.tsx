import type { ReactNode } from "react";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

import { PharmaflowLanding } from "./PharmaflowLanding";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-landing-sans",
  weight: ["400", "500", "600", "700"],
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-landing-serif",
  weight: "400",
  style: ["normal", "italic"],
});

export function LandingFonts({ children }: { children: ReactNode }) {
  return <div className={`${sans.variable} ${serif.variable}`}>{children}</div>;
}

export function LandingShell() {
  return (
    <LandingFonts>
      <PharmaflowLanding />
    </LandingFonts>
  );
}

