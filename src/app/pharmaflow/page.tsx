import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

import { PharmaflowLanding } from "@/components/landing/PharmaflowLanding";

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

export const metadata: Metadata = {
  title: "Pharmaflow — AI-Powered Pharmaceutical Business Platform",
  description:
    "Pharmaflow is the operations system for pharmaceutical manufacturers, distributors, and medical suppliers in Kenya. Command, inventory, materials, procurement, and execution in one workspace.",
};

export default function PharmaflowPage() {
  return (
    <div className={`${sans.variable} ${serif.variable}`}>
      <PharmaflowLanding />
    </div>
  );
}
