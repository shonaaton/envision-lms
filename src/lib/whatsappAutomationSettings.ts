import { dbConnect } from "@/lib/db";
import { WhatsAppAutomationSetting } from "@/models/WhatsAppAutomationSetting";

export async function isWhatsAppAutomationTemplateEnabled(templateName: string) {
  const cleanName = String(templateName || "").trim();
  if (!cleanName) return false;
  await dbConnect();
  const setting: any = await WhatsAppAutomationSetting.findOne({ templateName: cleanName }).select("enabled").lean();
  return setting?.enabled !== false;
}

