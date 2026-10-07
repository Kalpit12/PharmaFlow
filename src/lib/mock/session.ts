import { DEMO_DEV_EMAIL_DEFAULT } from "@/lib/demo-tenant";

export type MockUser = {
  id: string;
  name: string;
  role: string;
  email: string;
  initials: string;
};

export const mockUser: MockUser = {
  id: "user-alex-morgan",
  name: "Alex Morgan",
  role: "Operations Manager",
  email: DEMO_DEV_EMAIL_DEFAULT,
  initials: "AM",
};

export function getMockUser(): MockUser {
  return mockUser;
}
