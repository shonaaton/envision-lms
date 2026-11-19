import { notFound } from "next/navigation";
import { callTargetForLead } from "@/lib/demoLeadWhatsApp";
import { leadIdFromCallToken } from "@/lib/demoLeadWhatsAppRules";
import CallRedirect from "./CallRedirect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Call Envision Chess Academy", robots: { index: false, follow: false } };

/**
 * Where the "Call sales person" button on the new-lead welcome WhatsApp lands
 * (src/lib/demoLeadWhatsApp.ts). WhatsApp template buttons cannot hold a
 * different phone number per message, so the button opens this page, which
 * opens the dialler on the lead's salesperson (or the academy number when the
 * salesperson has none on their account). The tap is noted on the lead.
 */
export default async function DemoLeadCallPage({ params }: { params: { token: string } }) {
  const leadId = leadIdFromCallToken(decodeURIComponent(params.token || ""));
  if (!leadId) notFound();
  const target = await callTargetForLead(leadId);
  if (!target) notFound();
  const tel = `tel:+${target.digits}`;
  const display = `+${target.digits}`;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f2fa", padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <CallRedirect href={tel} />
      <div style={{ maxWidth: 360, width: "100%", background: "#fff", borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "0 10px 30px rgba(90,19,114,.12)" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#5a1372" }}>Envision Chess Academy</p>
        <h1 style={{ margin: "12px 0 6px", fontSize: 24, color: "#0a0a0a" }}>Call {target.name}</h1>
        <p style={{ margin: "0 0 20px", color: "#475569", fontSize: 15 }}>Your phone should open the dialler. If it does not, tap the button below.</p>
        <a href={tel} style={{ display: "block", background: "#5a1372", color: "#fff", borderRadius: 12, padding: "14px 16px", fontWeight: 800, fontSize: 17, textDecoration: "none" }}>
          Call {display}
        </a>
      </div>
    </main>
  );
}
