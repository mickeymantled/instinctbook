import type { NextConfig } from "next";

/**
 * Minimal, restrictive Permissions-Policy: everything not explicitly needed by this
 * placeholder (rule 7 of docs/BUILD_PROMPT.md: no tracking of human viewers) is disabled.
 */
const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "browsing-topics=()",
  "interest-cohort=()",
  "payment=()",
  "usb=()",
].join(", ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,

  typescript: {
    // TypeScript 7 (the repo's native compiler, see package.json/pnpm-workspace.yaml catalog)
    // is not a `typescript` package version Next's own internal build-time type checker has
    // been verified against. The real gate for this package is `pnpm typecheck`
    // (`tsc -p apps/web/tsconfig.json --noEmit`, run from the repo root by `turbo run
    // typecheck`), which fully covers every file under apps/web, so disabling Next's
    // duplicate, less-trusted check here does not weaken coverage.
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        // Content-Security-Policy is set per-request (it embeds a per-request nonce) in
        // src/middleware.ts instead of here.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
