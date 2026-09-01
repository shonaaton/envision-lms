import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WHATSAPP_TEMPLATE_DEFINITIONS, type WhatsAppTemplateDefinition } from "@/lib/whatsappTemplateRegistry";

export const dynamic = "force-dynamic";

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeTemplateLanguage(value?: string) {
  const clean = cleanEnv(value || "en");
  if (!clean || clean === "en_US" || clean === "en_GB" || clean === "en_UK") return "en";
  return clean;
}

function variableSamples(component: any) {
  const bodyText = component?.example?.body_text;
  if (!Array.isArray(bodyText)) return [];
  const firstExample = Array.isArray(bodyText[0]) ? bodyText[0] : bodyText;
  return firstExample.map((value: unknown) => String(value || "").trim());
}

function templateVariables(component: any) {
  const text = String(component?.text || "");
  const samples = variableSamples(component);
  const positions = Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
    .map((match) => Number(match[1]))
    .filter((position) => Number.isFinite(position));
  return Array.from(new Set(positions))
    .sort((a, b) => a - b)
    .map((position) => ({
      position,
      key: `body_${position}`,
      sample: samples[position - 1] || `Sample ${position}`,
    }));
}

function mapMetaTemplate(template: any): WhatsAppTemplateDefinition | null {
  const name = String(template?.name || "").trim();
  if (!name) return null;
  const components = Array.isArray(template?.components) ? template.components : [];
  const bodyComponent = components.find((component: any) => String(component?.type || "").toUpperCase() === "BODY");
  return {
    name,
    language: normalizeTemplateLanguage(template?.language),
    sourceAutomation: `Meta ${String(template?.category || "Template").toLowerCase()}`,
    body: String(bodyComponent?.text || name.replace(/_/g, " ")),
    variables: templateVariables(bodyComponent),
  };
}

export async function GET() {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN);
  const businessAccountId = cleanEnv(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID);
  const graphVersion = cleanEnv(process.env.WHATSAPP_GRAPH_VERSION || "v25.0");
  if (!accessToken || !businessAccountId) {
    return NextResponse.json({
      ok: false,
      source: "local",
      message: "Meta template sync needs WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN.",
      templates: WHATSAPP_TEMPLATE_DEFINITIONS,
    });
  }

  const fields = "name,language,status,category,components";
  const url = `https://graph.facebook.com/${graphVersion}/${businessAccountId}/message_templates?fields=${encodeURIComponent(fields)}&limit=250&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({
      ok: false,
      source: "local",
      message: payload?.error?.message || "Meta template sync failed. Showing local templates.",
      templates: WHATSAPP_TEMPLATE_DEFINITIONS,
      metaError: payload?.error || null,
    }, { status: 200 });
  }

  const templates = (Array.isArray(payload?.data) ? payload.data : [])
    .filter((template: any) => String(template?.status || "").toUpperCase() === "APPROVED")
    .map(mapMetaTemplate)
    .filter(Boolean);

  return NextResponse.json({
    ok: true,
    source: "meta",
    templates: templates.length ? templates : WHATSAPP_TEMPLATE_DEFINITIONS,
  });
}
