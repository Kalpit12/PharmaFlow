/** Product (SaaS) brand — distinct from tenant branding in `tenant.ts`. */
export const product = {
  name: "Pharmaflow",
  /** Lowercase lockup matching the brand mark. */
  wordmark: "pharmaflow",
  tagline: "Pharmaceutical Operations Command System",
  shortTagline: "Operations Command",
  logo: {
    mark: "/brand/logo-mark.png",
    markSm: "/brand/logo-mark-64.png",
    full: "/brand/logo-full.png",
    favicon: "/brand/favicon.png",
    appIconDark: "/brand/app-icon-dark.png",
    appIconLight: "/brand/app-icon-light.png",
    appIconTinted: "/brand/app-icon-tinted.png",
  },
} as const;
