export type TemplateVariable = { position: number; key: string; sample: string };
export type TemplateButton = { type: "URL" | "PHONE_NUMBER" | "QUICK_REPLY"; text: string; url?: string; phone_number?: string };
export type TemplateDraft = { name: string; language: string; category: "UTILITY" | "MARKETING"; body: string; header: string; footer: string; variables: TemplateVariable[]; buttons: TemplateButton[] };
export type LibraryTemplate = TemplateDraft & { id: string; metaId?: string; status: string; rejectionReason?: string; submissionError?: string; updatedAt?: string; lastSyncedAt?: string; revision: number; contentVersion: string; sendable: boolean; unsupportedReason?: string; components?: any[] };

export const TEMPLATE_LANGUAGES = [["en", "English"], ["en_US", "English (US)"], ["en_GB", "English (UK)"], ["hi", "Hindi"], ["bn", "Bengali"], ["ta", "Tamil"], ["te", "Telugu"], ["mr", "Marathi"], ["gu", "Gujarati"], ["kn", "Kannada"], ["ml", "Malayalam"], ["pa", "Punjabi"], ["ur", "Urdu"], ["ar", "Arabic"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt_BR", "Portuguese (Brazil)"]] as const;

export function variablePositions(body: string) {
  return [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

export function validateTemplateDraft(input: any): { draft?: TemplateDraft; error?: string } {
  const name = String(input.name || "").trim();
  const language = String(input.language || "en").trim();
  const category = String(input.category || "UTILITY").toUpperCase();
  const body = String(input.body || "").trim();
  const header = String(input.header || "").trim();
  const footer = String(input.footer || "").trim();
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(name)) return { error: "Use a template name starting with a lowercase letter, followed by lowercase letters, numbers or underscores." };
  if (!TEMPLATE_LANGUAGES.some(([code]) => code === language)) return { error: "Choose a supported language." };
  if (!["UTILITY", "MARKETING"].includes(category)) return { error: "Choose Utility or Marketing." };
  if (!body || body.length > 1024) return { error: "Message body must contain 1–1024 characters." };
  if (header.length > 60 || footer.length > 60 || /[{}\r\n]/.test(header + footer)) return { error: "Header and footer must be single-line text, up to 60 characters, without variables." };
  if (/[\t]/.test(body)) return { error: "Use spaces instead of tabs in the message body." };
  const positions = variablePositions(body);
  if (/[{}]/.test(body.replace(/\{\{\s*\d+\s*\}\}/g, "")) || positions.some((position, index) => position !== index + 1)) return { error: "Use consecutive variables: {{1}}, {{2}}, and so on." };
  if (/^\{\{/.test(body) || /\}\}$/.test(body) || /\}\}\s*\{\{/.test(body)) return { error: "Add meaningful text before, after and between variables." };
  const variables = positions.map((position) => {
    const supplied = Array.isArray(input.variables) ? input.variables.find((item: any) => Number(item.position) === position) : null;
    return { position, key: String(supplied?.key || `value_${position}`).trim().slice(0, 60), sample: String(supplied?.sample || "").trim().slice(0, 200) };
  });
  if (variables.some((variable) => !variable.sample || /[{}\r\n]/.test(variable.sample))) return { error: "Provide a realistic, single-line example for every variable." };
  const buttons = Array.isArray(input.buttons) ? input.buttons : [];
  if (buttons.length > 3) return { error: "Add up to three buttons." };
  const normalized: TemplateButton[] = [];
  for (const button of buttons) {
    const type = String(button.type || "").toUpperCase();
    const text = String(button.text || "").trim();
    if (!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(type) || !text || text.length > 25 || /[{}\r\n]/.test(text)) return { error: "Each button needs a valid type and a label of 1–25 characters." };
    if (type === "URL") {
      const url = String(button.url || "").trim();
      try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || /[{}]/.test(url) || url.length > 2000) throw new Error(); } catch { return { error: "Website buttons need a complete http or https URL without variables." }; }
      normalized.push({ type, text, url });
    } else if (type === "PHONE_NUMBER") {
      const phone_number = String(button.phone_number || "").trim();
      if (!/^\+\d{7,15}$/.test(phone_number)) return { error: "Phone buttons need an international number starting with +." };
      normalized.push({ type, text, phone_number });
    } else normalized.push({ type: "QUICK_REPLY", text });
  }
  if (normalized.some((button) => button.type === "QUICK_REPLY") && normalized.some((button) => button.type !== "QUICK_REPLY")) return { error: "Use quick replies or website/phone buttons in one template, rather than mixing them." };
  if (normalized.filter((button) => button.type === "PHONE_NUMBER").length > 1 || normalized.filter((button) => button.type === "URL").length > 2) return { error: "Use up to two website buttons and one phone button." };
  return { draft: { name, language, category: category as TemplateDraft["category"], body, header, footer, variables, buttons: normalized } };
}

export function templateComponents(draft: TemplateDraft) {
  return [
    ...(draft.header ? [{ type: "HEADER", format: "TEXT", text: draft.header }] : []),
    { type: "BODY", text: draft.body, ...(draft.variables.length ? { example: { body_text: [draft.variables.map((variable) => variable.sample)] } } : {}) },
    ...(draft.footer ? [{ type: "FOOTER", text: draft.footer }] : []),
    ...(draft.buttons.length ? [{ type: "BUTTONS", buttons: draft.buttons }] : []),
  ];
}

export function renderTemplateBody(body: string, values: string[]) {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, position) => values[Number(position) - 1] ?? whole);
}

export function templateSendSupport(components: any[]) {
  for (const component of components) {
    const type = String(component.type || "").toUpperCase();
    if (type === "HEADER" && (String(component.format).toUpperCase() !== "TEXT" || /\{\{/.test(component.text || ""))) return "This template needs a media or variable header. Create a text-header version to send from this portal.";
    if (type === "BODY" && /\{\{\s*[^\d\s}]/.test(component.text || "")) return "This template uses named variables. Create a version using {{1}}, {{2}}, and so on.";
    if (type === "BUTTONS" && (component.buttons || []).some((button: any) => !["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(button.type) || /\{\{/.test(button.url || ""))) return "This template needs additional button parameters. Create a version with static buttons to send from this portal.";
    if (!["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(type)) return "This template uses a component that this sender does not support.";
  }
  return "";
}
