import { dbConnect } from "@/lib/db";
import { WhatsAppAutomationSetting } from "@/models/WhatsAppAutomationSetting";

/**
 * Templates that replace an approved one and so start switched off: the caller
 * keeps sending the old template until an admin turns the new one on in the
 * WhatsApp workspace, after Meta approves it. Every other template is on unless
 * switched off. The invoice_*_pay reminders left this list on 2026-11-02, once
 * Meta had approved them.
 */
export const OFF_UNTIL_ENABLED_TEMPLATES: ReadonlySet<string> = new Set<string>([]);

export function defaultTemplateEnabled(templateName: string) {
  return !OFF_UNTIL_ENABLED_TEMPLATES.has(templateName);
}

export async function isWhatsAppAutomationTemplateEnabled(templateName: string) {
  const cleanName = String(templateName || "").trim();
  if (!cleanName) return false;
  await dbConnect();
  const setting: any = await WhatsAppAutomationSetting.findOne({ templateName: cleanName }).select("enabled").lean();
  return setting ? setting.enabled !== false : defaultTemplateEnabled(cleanName);
}
