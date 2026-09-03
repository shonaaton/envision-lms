import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { resolveWhatsAppMetaTemplateName, WHATSAPP_TEMPLATE_DEFINITIONS, type WhatsAppTemplateDefinition } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppAutomationSetting } from "@/models/WhatsAppAutomationSetting";

export const dynamic = "force-dynamic";

type WhatsAppTemplateWithMeta = WhatsAppTemplateDefinition & {
  metaStatus?: string;
  metaCategory?: string;
  metaLanguage?: string;
  metaTemplateName?: string;
  metaSynced?: boolean;
  requiredByLms?: boolean;
};

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function timingSafeEqualText(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function isBridgeAuthorized(req: Request) {
  const expectedSecret = cleanEnv(process.env.WHATSAPP_TEMPLATE_BRIDGE_SECRET);
  if (!expectedSecret) return false;
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const headerSecret = req.headers.get("x-lms-whatsapp-template-secret") || "";
  const receivedSecret = cleanEnv(bearer || headerSecret);
  return Boolean(receivedSecret) && timingSafeEqualText(receivedSecret, expectedSecret);
}

async function canUseTemplateEndpoint(req: Request) {
  if (isBridgeAuthorized(req)) return true;
  const session = await auth();
  return canManageWhatsApp(session);
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

function metaTemplateKey(name?: string, language?: string) {
  return `${String(name || "").trim()}::${normalizeTemplateLanguage(language)}`;
}

function mapMetaTemplate(template: any): WhatsAppTemplateWithMeta | null {
  const name = String(template?.name || "").trim();
  if (!name) return null;
  const components = Array.isArray(template?.components) ? template.components : [];
  const bodyComponent = components.find((component: any) => String(component?.type || "").toUpperCase() === "BODY");
  const language = normalizeTemplateLanguage(template?.language);
  return {
    name,
    language,
    sourceAutomation: `Meta ${String(template?.category || "Template").toLowerCase()}`,
    body: String(bodyComponent?.text || name.replace(/_/g, " ")),
    variables: templateVariables(bodyComponent),
    metaStatus: String(template?.status || "UNKNOWN").toUpperCase(),
    metaCategory: String(template?.category || ""),
    metaLanguage: language,
    metaSynced: true,
    requiredByLms: false,
  };
}

async function templatesWithSettings(templates: readonly WhatsAppTemplateWithMeta[]) {
  await dbConnect();
  const settings = await WhatsAppAutomationSetting.find({
    templateName: { $in: templates.map((template) => template.name) },
  }).select("templateName enabled").lean();
  const settingMap = new Map(settings.map((setting: any) => [String(setting.templateName), setting.enabled !== false]));
  return templates.map((template) => ({
    ...template,
    automationEnabled: settingMap.get(template.name) ?? true,
  }));
}

async function buildLocalAudit(metaStatus: "NOT_SYNCED" | "SYNC_FAILED") {
  const localTemplates = WHATSAPP_TEMPLATE_DEFINITIONS.map((template) => ({
    ...template,
    metaStatus,
    metaSynced: false,
    requiredByLms: true,
  }));
  return {
    templates: await templatesWithSettings(localTemplates),
    requiredTemplateCount: WHATSAPP_TEMPLATE_DEFINITIONS.length,
    approvedRequiredCount: 0,
    missingApprovedTemplates: localTemplates,
  };
}

async function buildMetaAudit(input: { accessToken: string; businessAccountId: string; graphVersion: string }) {
  const { accessToken, businessAccountId, graphVersion } = input;
  if (!accessToken || !businessAccountId) {
    const audit = await buildLocalAudit("NOT_SYNCED");
    return NextResponse.json({
      ok: false,
      source: "local",
      message: "Meta template sync needs WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN.",
      ...audit,
    });
  }

  const fields = "name,language,status,category,components";
  const url = `https://graph.facebook.com/${graphVersion}/${businessAccountId}/message_templates?fields=${encodeURIComponent(fields)}&limit=250&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const audit = await buildLocalAudit("SYNC_FAILED");
    return NextResponse.json({
      ok: false,
      source: "local",
      message: payload?.error?.message || "Meta template sync failed. Showing local templates.",
      ...audit,
      metaError: payload?.error || null,
    }, { status: 200 });
  }

  const metaTemplates = (Array.isArray(payload?.data) ? payload.data : [])
    .map(mapMetaTemplate)
    .filter(Boolean);
  const metaMap = new Map(metaTemplates.map((template: any) => [metaTemplateKey(template.name, template.language), template]));
  const requiredTemplates = WHATSAPP_TEMPLATE_DEFINITIONS.map((template) => {
    const metaTemplateName = resolveWhatsAppMetaTemplateName(template.name);
    const metaTemplate = metaMap.get(metaTemplateKey(metaTemplateName, template.language)) as WhatsAppTemplateWithMeta | undefined;
    return {
      ...template,
      metaStatus: metaTemplate?.metaStatus || "MISSING",
      metaCategory: metaTemplate?.metaCategory || "",
      metaLanguage: metaTemplate?.metaLanguage || template.language,
      metaTemplateName,
      metaSynced: Boolean(metaTemplate),
      requiredByLms: true,
    };
  });
  const requiredKeys = new Set(requiredTemplates.map((template) => metaTemplateKey(template.metaTemplateName || template.name, template.language)));
  const metaOnlyApprovedTemplates = metaTemplates.filter((template: any) => (
    template.metaStatus === "APPROVED" && !requiredKeys.has(metaTemplateKey(template.name, template.language))
  ));
  const missingApprovedTemplates = requiredTemplates.filter((template) => template.metaStatus !== "APPROVED");
  const approvedRequiredCount = requiredTemplates.length - missingApprovedTemplates.length;

  return NextResponse.json({
    ok: true,
    source: "meta",
    templates: await templatesWithSettings([...requiredTemplates, ...metaOnlyApprovedTemplates]),
    requiredTemplateCount: requiredTemplates.length,
    approvedRequiredCount,
    missingApprovedTemplates,
    metaTemplateCount: metaTemplates.length,
  });
}

function templateCreatePayload(template: WhatsAppTemplateDefinition) {
  const bodyComponent: any = {
    type: "BODY",
    text: template.body,
  };
  const samples = template.variables
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((variable) => variable.sample)
    .filter(Boolean);
  if (samples.length) {
    bodyComponent.example = {
      body_text: [samples],
    };
  }
  return {
    name: template.name,
    language: normalizeTemplateLanguage(template.language),
    category: "UTILITY",
    components: [bodyComponent],
  };
}

async function createMetaTemplate(input: { template: WhatsAppTemplateDefinition; accessToken: string; businessAccountId: string; graphVersion: string }) {
  const { template, accessToken, businessAccountId, graphVersion } = input;
  const url = `https://graph.facebook.com/${graphVersion}/${businessAccountId}/message_templates`;
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(templateCreatePayload(template)),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    templateName: template.name,
    language: normalizeTemplateLanguage(template.language),
    metaStatus: String(payload?.status || payload?.data?.status || "").toUpperCase(),
    payload,
    error: response.ok ? null : payload?.error || { message: "Meta template creation failed." },
  };
}

function metaEnv() {
  return {
    accessToken: cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN),
    businessAccountId: cleanEnv(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID),
    graphVersion: cleanEnv(process.env.WHATSAPP_GRAPH_VERSION || "v25.0"),
  };
}

export async function GET(req: Request) {
  if (!(await canUseTemplateEndpoint(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return buildMetaAudit(metaEnv());
}

export async function POST(req: Request) {
  if (!isBridgeAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized. Set WHATSAPP_TEMPLATE_BRIDGE_SECRET and send it as a Bearer token or x-lms-whatsapp-template-secret." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "audit").trim();
  const env = metaEnv();
  if (action === "audit") return buildMetaAudit(env);
  if (action !== "create_missing") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });

  const auditResponse = await buildMetaAudit(env);
  const audit = await auditResponse.json();
  if (!auditResponse.ok || !audit.ok) return NextResponse.json({ ok: false, message: audit.message || "Template audit failed.", audit }, { status: 200 });

  const missingTemplates = Array.isArray(audit.missingApprovedTemplates)
    ? audit.missingApprovedTemplates.filter((template: any) => String(template?.metaStatus || "").toUpperCase() === "MISSING")
    : [];
  const names = Array.isArray(body.templateNames) && body.templateNames.length ? new Set(body.templateNames.map((name: unknown) => String(name || "").trim())) : null;
  const selectedTemplates = missingTemplates
    .filter((template: WhatsAppTemplateDefinition) => !names || names.has(template.name))
    .slice(0, Math.max(1, Math.min(50, Number(body.limit || 50))));

  if (body.confirm !== true) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      message: "Send action=create_missing with confirm=true to submit these templates to Meta.",
      templates: selectedTemplates.map(templateCreatePayload),
      missingCount: missingTemplates.length,
    });
  }

  const results = [];
  for (const template of selectedTemplates) {
    results.push(await createMetaTemplate({ template, ...env }));
  }
  return NextResponse.json({
    ok: results.every((result) => result.ok),
    submittedCount: results.length,
    results,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session?.user as any)?.id;

  const body = await req.json().catch(() => ({}));
  const templateName = String(body.templateName || "").trim();
  if (!templateName) return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  const enabled = body.enabled !== false;

  await dbConnect();
  const setting = await WhatsAppAutomationSetting.findOneAndUpdate(
    { templateName },
    {
      templateName,
      enabled,
      updatedBy: userId || undefined,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return NextResponse.json({ ok: true, templateName, automationEnabled: (setting as any)?.enabled !== false });
}
