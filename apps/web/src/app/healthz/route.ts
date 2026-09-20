import { NextResponse } from "next/server";

// Liveness probe: no dependency checks, must always succeed while the process is up. Never
// statically cached.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" as const });
}
