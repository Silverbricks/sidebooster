import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for the host's health checks. Returns 200 only if the database answers. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
