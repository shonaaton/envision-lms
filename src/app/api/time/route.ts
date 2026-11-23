import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The server's clock, for pages that open or close something at a set time.
 * A student's phone or tablet clock can be minutes out; the Join button reads
 * this once per page and corrects for the difference (lib/serverClock.ts).
 */
export async function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
