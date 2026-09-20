import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Builds a strict, no-inline-script CSP for a per-request nonce. Next's App Router needs an
 * inline script to stream/hydrate RSC payloads; rather than weaken script-src with
 * 'unsafe-inline', we hand Next a per-request nonce via the `x-nonce` request header (Next
 * reads it and applies it to the scripts it injects) and echo the same nonce in the response's
 * CSP `script-src`, per Next's documented CSP-with-nonce recipe.
 */
function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and the favicon; every real page/route response gets the CSP.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
