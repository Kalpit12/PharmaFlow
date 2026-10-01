import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/ai", "/app-preview", "/approvals", "/communications", "/operations", "/reports", "/inventory", "/materials", "/procurement", "/suppliers", "/daily-review", "/execution", "/command-center", "/forecast", "/scenarios", "/rfqs", "/purchase-orders", "/receiving", "/supplier-performance", "/batches", "/quality", "/traceability", "/governance"];

const handler = auth((request) => {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (isProtected && !request.auth) {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

export const proxy = handler;
export default handler;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ai/:path*",
    "/app-preview/:path*",
    "/approvals/:path*",
    "/communications/:path*",
    "/operations/:path*",
    "/reports/:path*",
    "/inventory/:path*",
    "/materials",
    "/materials/:path*",
    "/procurement",
    "/procurement/:path*",
    "/suppliers",
    "/suppliers/:path*",
    "/daily-review",
    "/daily-review/:path*",
    "/execution",
    "/execution/:path*",
    "/command-center",
    "/command-center/:path*",
    "/forecast",
    "/forecast/:path*",
    "/scenarios",
    "/scenarios/:path*",
    "/rfqs",
    "/rfqs/:path*",
    "/purchase-orders",
    "/purchase-orders/:path*",
    "/receiving",
    "/receiving/:path*",
    "/supplier-performance",
    "/supplier-performance/:path*",
    "/batches",
    "/batches/:path*",
    "/quality",
    "/quality/:path*",
    "/traceability",
    "/traceability/:path*",
    "/governance",
    "/governance/:path*",
  ],
};
