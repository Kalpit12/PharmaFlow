import type { Metadata } from "next";

import { LandingShell } from "@/components/landing/LandingShell";

export const metadata: Metadata = {
  title: "Pharmaflow — AI-Powered Pharmaceutical Business Platform",
  description:
    "Pharmaflow is the operations system for pharmaceutical manufacturers, distributors, and medical suppliers in Kenya. Command, inventory, materials, procurement, and execution in one workspace.",
};

export default function Home() {
  return <LandingShell />;
}
