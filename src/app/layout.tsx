import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { PreferencesProvider } from "@/components/providers/preferences-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const uiSans = IBM_Plex_Sans({
  variable: "--font-ui-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pharmaflow",
  description: "Pharmaceutical Operations Command System",
  icons: {
    icon: [{ url: "/brand/favicon.png", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${uiSans.variable} ${geistMono.variable} h-full overflow-hidden`}>
      <head>
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="flex h-full min-h-0 flex-col overflow-hidden">
        <ThemeProvider>
          <PreferencesProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
