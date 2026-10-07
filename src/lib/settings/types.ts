import type { TenantStatus } from "@prisma/client";

export type SettingsSnapshot = {
  account: {
    name: string;
    email: string;
    roleLabel: string;
  };
  workspace: {
    name: string;
    slug: string;
    status: TenantStatus;
  };
  security: {
    authentication: "Credentials";
    session: "Encrypted JWT";
    mfa: "Not configured";
    sso: "Not configured";
  };
  canViewAdministration: boolean;
  canViewGovernance: boolean;
  disclaimer: string;
};
