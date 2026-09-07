import { NextResponse } from "next/server";
import { getCrmPayload } from "@/lib/crm/leads";
import { requireSalesViewer } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

/**
 * Poll feed for the CRM workspace.
 *
 * The page refreshes on a short interval rather than a socket. Inbound changes
 * land in the mirror the moment Kraya fires its webhook, so a poll is all that is
 * needed to surface them, and it matches how the rest of the portal stays live
 * (the WhatsApp inbox and the sidebar unread count both poll).
 */
export async function GET() {
  const viewer = await requireSalesViewer("salesCrm");
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getCrmPayload());
}
