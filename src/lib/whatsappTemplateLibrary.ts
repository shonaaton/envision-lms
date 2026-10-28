import { WhatsAppTemplate } from "@/models/WhatsAppTemplate";
import { templateComponents, templateSendSupport, variablePositions, type LibraryTemplate } from "./whatsappTemplateRules";
import { whatsappGraph, whatsappMetaConfig, WhatsAppMetaError } from "./whatsappMeta";

export const templateAccount = () => whatsappMetaConfig().businessAccountId || "unconfigured";
export const templateAccountFilter = () => ({ businessAccountId: { $in: [templateAccount(), "unconfigured"] } });

export function templateContentVersion(template: any) {
  const content = JSON.stringify({ name: template.name, language: template.language, category: template.category, body: template.body, header: template.header || "", footer: template.footer || "", buttons: template.buttons || [] });
  return (eval("require")("crypto") as typeof import("crypto")).createHash("sha256").update(content).digest("hex");
}

export function serializeLibraryTemplate(template: any): LibraryTemplate {
  const components = template.components?.length ? template.components : templateComponents(template);
  const unsupportedReason = templateSendSupport(components);
  return {
    id: String(template._id), name: template.name, language: template.language, category: template.category,
    body: template.body || "", header: template.header || "", footer: template.footer || "", variables: template.variables || [], buttons: template.buttons || [],
    metaId: template.metaId, status: template.status, rejectionReason: template.rejectionReason || "", submissionError: template.submissionError || "",
    revision: template.revision || 1, contentVersion: templateContentVersion(template), updatedAt: template.updatedAt, lastSyncedAt: template.lastSyncedAt, components,
    unsupportedReason, sendable: template.status === "APPROVED" && Boolean(template.metaId) && !unsupportedReason && template.businessAccountId === templateAccount(),
  };
}

function metaFields(template: any) {
  const components: any[] = template.components || [];
  const body = components.find((item) => item.type === "BODY");
  const samples: string[] = body?.example?.body_text?.[0] || [];
  return {
    metaId: String(template.id), status: String(template.status || "UNKNOWN").toUpperCase(), category: String(template.category || "UTILITY"),
    body: String(body?.text || ""), header: String(components.find((item) => item.type === "HEADER")?.text || ""), footer: String(components.find((item) => item.type === "FOOTER")?.text || ""),
    buttons: components.find((item) => item.type === "BUTTONS")?.buttons || [], components,
    variables: variablePositions(body?.text || "").map((position) => ({ position, key: `value_${position}`, sample: String(samples[position - 1] || "") })),
    rejectionReason: String(template.rejected_reason || ""), submissionError: "",
  };
}

export async function syncTemplateLibrary() {
  const { businessAccountId } = whatsappMetaConfig();
  if (!businessAccountId) throw new WhatsAppMetaError("The WhatsApp business account is not configured.", 503);
  await WhatsAppTemplate.init();
  const startedAt = new Date();
  let after = "", count = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ fields: "id,name,language,status,category,components,rejected_reason", limit: "100", ...(after ? { after } : {}) });
    const payload = await whatsappGraph(`${businessAccountId}/message_templates?${params}`);
    if (!Array.isArray(payload.data)) throw new WhatsAppMetaError("Meta returned an invalid template list.");
    for (const remote of payload.data) {
      if (!remote.id || !remote.name || !remote.language) continue;
      const identity = { businessAccountId, name: String(remote.name), language: String(remote.language) };
      const existing: any = await WhatsAppTemplate.findOne(identity).lean();
      const fields = metaFields(remote);
      if (existing?.variables?.length) fields.variables = fields.variables.map((variable) => ({ ...variable, key: existing.variables.find((item: any) => item.position === variable.position)?.key || variable.key }));
      if (!existing) {
        try { await WhatsAppTemplate.create({ ...identity, ...fields, lastSyncedAt: startedAt, statusObservedAt: startedAt }); }
        catch (error: any) { if (error.code !== 11000) throw error; }
      } else {
        await WhatsAppTemplate.updateOne({ _id: existing._id, $or: [{ statusObservedAt: { $lte: startedAt } }, { statusObservedAt: { $exists: false } }] }, { $set: { ...fields, lastSyncedAt: startedAt, statusObservedAt: startedAt } });
      }
      count++;
    }
    const next = payload.paging?.next ? String(payload.paging?.cursors?.after || "") : "";
    if (!next) return { count, syncedAt: startedAt };
    if (seen.has(next)) throw new WhatsAppMetaError("Meta returned a repeated pagination cursor. Try refreshing later.");
    seen.add(next); after = next;
  }
  throw new WhatsAppMetaError("The template list exceeded the sync limit. Try again or narrow the connected business account.");
}

export async function getApprovedLibraryTemplate(id: string, refresh = true) {
  let template: any = await WhatsAppTemplate.findOne({ _id: id, businessAccountId: templateAccount() }).lean();
  if (!template) throw new WhatsAppMetaError("Template not found for the connected business account.", 404);
  if (refresh && template.metaId) {
    const startedAt = new Date();
    const remote = await whatsappGraph(`${encodeURIComponent(template.metaId)}?fields=id,name,language,status,category,components,rejected_reason`);
    const fields = metaFields(remote);
    fields.variables = fields.variables.map((variable) => ({ ...variable, key: template.variables?.find((item: any) => item.position === variable.position)?.key || variable.key }));
    await WhatsAppTemplate.updateOne({ _id: template._id, $or: [{ statusObservedAt: { $lte: startedAt } }, { statusObservedAt: { $exists: false } }] }, { $set: { ...fields, lastSyncedAt: startedAt, statusObservedAt: startedAt } });
    template = await WhatsAppTemplate.findById(template._id).lean();
  }
  const serialized = serializeLibraryTemplate(template);
  if (!serialized.sendable) throw new WhatsAppMetaError(serialized.unsupportedReason || `This template is ${serialized.status.toLowerCase()} and cannot be sent.`, 409);
  return serialized;
}

export async function recordTemplateStatusWebhook(entry: any, change: any) {
  if (change.field !== "message_template_status_update") return;
  const config = whatsappMetaConfig();
  if (!config.businessAccountId || String(entry.id || "") !== config.businessAccountId) return;
  const value = change.value || {};
  const metaId = String(value.message_template_id || "");
  if (!metaId) return;
  // Refresh remains available when the Meta app has not subscribed to this field.
  const observedAt = entry.time ? new Date(Number(entry.time) * 1000) : new Date();
  if (!Number.isFinite(observedAt.getTime())) return;
  await WhatsAppTemplate.updateMany({ businessAccountId: config.businessAccountId, metaId, $or: [{ statusObservedAt: { $lte: observedAt } }, { statusObservedAt: { $exists: false } }] }, { $set: { status: String(value.event || "UNKNOWN").toUpperCase(), rejectionReason: value.reason && value.reason !== "NONE" ? String(value.reason) : "", statusObservedAt: observedAt, lastSyncedAt: new Date() } });
}
