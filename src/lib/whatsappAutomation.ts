import { carriesCountryCode, exceedsNationalLength, splitInternationalNumber } from "@/lib/phoneCountryCodes";
import { notifyFailure } from "@/lib/failureNotifications";
import { dbConnect } from "@/lib/db";
import { renderWhatsAppTemplatePreview, resolveWhatsAppMetaTemplateName } from "@/lib/whatsappTemplateRegistry";
import { isWhatsAppAutomationTemplateEnabled } from "@/lib/whatsappAutomationSettings";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export type WhatsAppSendResult = {
  ok: boolean;
  delivered: boolean;
  skipped: boolean;
  status?: number;
  payload?: any;
  debug?: Record<string, unknown>;
  error?: string;
  errorMessage?: string;
  testMode?: boolean;
  recipient?: string;
  metaMessageId?: string;
};

type WhatsAppReminderInput = {
  to?: string;
  countryCode?: string;
  message: string;
  templateText?: string;
  templateName?: string;
  language?: string;
  templateVariables?: string[];
  metadata?: Record<string, unknown>;
};

type WhatsAppTemplateInput = {
  to?: string;
  countryCode?: string;
  templateName: string;
  language?: string;
  bodyParameters?: string[];
  templateVariables?: string[];
  metadata?: Record<string, unknown>;
  testMode?: boolean;
  bypassN8n?: boolean;
};

type WhatsAppTextInput = {
  to?: string;
  countryCode?: string;
  text: string;
  previewUrl?: boolean;
  metadata?: Record<string, unknown>;
  testMode?: boolean;
  bypassN8n?: boolean;
};

export function normalizeWhatsAppNumber(value?: string) {
  return String(value || "").replace(/[^\d]/g, "");
}

/** Last-resort dialling code, used only when the portal has none on file for the contact. */
export function defaultWhatsAppCountryCode() {
  return normalizeWhatsAppNumber(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE) || "91";
}

export function normalizeWhatsAppRecipient(phone?: string, countryCode?: string) {
  const cleanPhone = normalizeWhatsAppNumber(phone);
  if (!cleanPhone) return "";
  // Drop the national trunk prefix ("07911..." -> "7911...") before deciding whether the
  // number already carries a dialling code, otherwise trunk-zero countries look international.
  const national = cleanPhone.replace(/^0+/, "");
  if (!national) return "";
  const cleanCountryCode = normalizeWhatsAppNumber(countryCode);
  if (cleanCountryCode) {
    if (carriesCountryCode(national, cleanCountryCode)) return national;
    // A number that already opens with its own dialling code but is too long to
    // be a national one is a malformed international number, not a local one.
    // Prefixing it again is how a stored "919162903499998" was dialled as
    // "91919162903499998" - and because the send is retried from the same
    // record, every attempt added another copy. Dial what is on file and let it
    // fail on a wrong number rather than on a number nobody could ever have.
    if (national.startsWith(cleanCountryCode) && exceedsNationalLength(national, cleanCountryCode)) return national;
    return `${cleanCountryCode}${national}`;
  }
  // Nothing on file: keep the number if it already reads as international, else assume local.
  if (national.length > 10 || splitInternationalNumber(national)) return national;
  return `${defaultWhatsAppCountryCode()}${national}`;
}

/**
 * Flattens one template body parameter into something Meta will accept.
 *
 * A template's own body may span lines - that is the approved template - but a
 * *parameter* substituted into it may not: Meta rejects the whole message when a
 * parameter contains a newline, a tab, or a run of more than four spaces. That
 * is why `class_assigned_coach` delivered for a batch meeting once a week and
 * failed for one meeting on Tuesdays and Thursdays: the second schedule put a
 * newline inside {{7}}. The lines are joined rather than dropped, so the coach
 * still sees every slot.
 */
export function sanitizeWhatsAppParameter(value: unknown) {
  const lines = String(value ?? "")
    .replace(/[\t\v\f]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .reduce((text, line) => {
      if (!text) return line;
      // Don't punctuate twice when the previous line already ends in a separator.
      return /[,;:|\u00b7\u2022-]$/.test(text) ? `${text} ${line}` : `${text}, ${line}`;
    }, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Body parameters in template order, flattened and with interior gaps filled.
 *
 * Position is everything in a template: an empty value in the middle used to be
 * dropped, which slid every later parameter one slot up the message and left
 * Meta with fewer parameters than the template declares - a rejection either
 * way. Trailing empties are still dropped, since a caller passing them is
 * telling us those placeholders are not in play.
 */
export function normalizeTemplateBodyParameters(values: unknown[]) {
  const cleaned = values.map((value) => sanitizeWhatsAppParameter(value).slice(0, 1024));
  let lastFilled = -1;
  cleaned.forEach((text, index) => {
    if (text) lastFilled = index;
  });
  return cleaned.slice(0, lastFilled + 1).map((text) => text || "-");
}

function configuredGraphVersion() {
  const value = String(process.env.WHATSAPP_GRAPH_VERSION || "v25.0").trim().replace(/^["']|["']$/g, "");
  return value.startsWith("v") ? value : `v${value}`;
}

function resolveRecipient(inputTo?: string, testModeOverride?: boolean, countryCode?: string) {
  const testMode = testModeOverride ?? process.env.WHATSAPP_TEST_MODE !== "false";
  const testRecipient = normalizeWhatsAppNumber(process.env.WHATSAPP_TEST_RECIPIENT);
  const recipient = testMode && testRecipient ? testRecipient : normalizeWhatsAppRecipient(inputTo, countryCode);
  return { testMode, recipient };
}

function whatsappConfig() {
  return {
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim().replace(/^["']|["']$/g, ""),
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim().replace(/^["']|["']$/g, ""),
  };
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeTemplateLanguage(value?: string) {
  const clean = cleanEnv(value || "en");
  if (!clean || clean === "en_US" || clean === "en_GB" || clean === "en_UK") return "en";
  return clean;
}

function n8nWebhookUrl() {
  return cleanEnv(process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL || process.env.WHATSAPP_N8N_SEND_WEBHOOK_URL);
}

function firstMetaMessageId(...values: any[]) {
  for (const value of values) {
    const messageId = String(
      value?.metaMessageId ||
        value?.messages?.[0]?.id ||
        value?.body?.messages?.[0]?.id ||
        value?.data?.messages?.[0]?.id ||
        value?.payload?.messages?.[0]?.id ||
        value?.payload?.results?.[0]?.metaMessageId ||
        value?.payload?.results?.[0]?.messages?.[0]?.id ||
        ""
    ).trim();
    if (messageId) return messageId;
  }
  return "";
}

function outboundStatus(result: WhatsAppSendResult) {
  const rawStatus = String((result.payload?.results?.[0]?.status || result.payload?.messages?.[0]?.message_status || "")).toLowerCase();
  if (["accepted", "sent", "queued", "delivered", "read", "failed"].includes(rawStatus)) return rawStatus;
  return result.ok ? "accepted" : "failed";
}

function contactNameFromMetadata(metadata?: Record<string, unknown>) {
  return String(
    metadata?.recipientName ||
      metadata?.studentName ||
      metadata?.coachName ||
      metadata?.adminName ||
      metadata?.name ||
      ""
  ).trim();
}

const WHATSAPP_USER_FIELDS = "_id name phone countryCode email username role";

/**
 * Candidate `User.phone` spellings for a full international WhatsApp number. Most records
 * store the national part, so the dialling code has to come off — and not just India's,
 * which is all the previous "^91" strip handled.
 */
export function whatsAppPhoneVariants(phoneNumber?: string) {
  const digits = normalizeWhatsAppNumber(phoneNumber);
  if (!digits) return [];
  const nationals = new Set<string>([digits]);
  const known = splitInternationalNumber(digits);
  if (known) nationals.add(known.national);
  // Countries outside the portal's list still need their code trimmed, so try every
  // plausible code length. Loose candidates are safe: the caller confirms them below.
  for (const codeLength of [1, 2, 3, 4]) {
    const rest = digits.slice(codeLength);
    if (rest.length >= 6) nationals.add(rest);
  }
  const variants = new Set<string>();
  for (const value of nationals) {
    variants.add(value);
    variants.add(`+${value}`);
    variants.add(`0${value}`);
  }
  return Array.from(variants);
}

/** Finds the LMS user behind a WhatsApp number, whichever country it belongs to. */
export async function findWhatsAppUserByPhone(phoneNumber?: string) {
  const digits = normalizeWhatsAppNumber(phoneNumber);
  const variants = whatsAppPhoneVariants(digits);
  if (!variants.length) return null;
  const candidates: any[] = await User.find({ phone: { $in: variants } }).select(WHATSAPP_USER_FIELDS).lean();
  if (!candidates.length) return null;
  // Prefer the user whose own country code reproduces this exact number. A loosely
  // trimmed candidate is only trusted when it is the one and only match.
  const exact = candidates.find((user) => normalizeWhatsAppRecipient(user.phone, user.countryCode) === digits);
  return exact || (candidates.length === 1 ? candidates[0] : null);
}

async function findMatchedUser(input: { userId?: unknown; phoneNumber: string }) {
  const userId = String(input.userId || "").trim();
  if (userId) {
    const user = await User.findById(userId).select(WHATSAPP_USER_FIELDS).lean();
    if (user) return user;
  }
  return findWhatsAppUserByPhone(input.phoneNumber);
}

/**
 * Dialling code for a contact: the one captured in the portal wins, otherwise it is read
 * back off the user record. Returns "" when nothing is on file so callers can fall back.
 */
export async function resolveWhatsAppCountryCode(input: { countryCode?: string; userId?: unknown }) {
  const explicit = normalizeWhatsAppNumber(input.countryCode);
  if (explicit) return explicit;
  return normalizeWhatsAppNumber(await countryCodeForUser(input.userId));
}

export async function countryCodeForUser(userId?: unknown) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return "";
  try {
    await dbConnect();
    const user: any = await User.findById(cleanUserId).select("countryCode").lean();
    return String(user?.countryCode || "");
  } catch {
    return "";
  }
}

async function recordOutboundTemplateMessage(input: WhatsAppTemplateInput, result: WhatsAppSendResult, bodyParameters: string[]) {
  const phoneNumber = normalizeWhatsAppRecipient(result.recipient || input.to, input.countryCode);
  if (!phoneNumber || result.skipped) return;
  try {
    await dbConnect();
    const matchedUser: any = await findMatchedUser({ userId: input.metadata?.userId, phoneNumber });
    await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || contactNameFromMetadata(input.metadata),
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "template",
      text: renderWhatsAppTemplatePreview(input.templateName, bodyParameters),
      templateName: input.templateName,
      templateLanguage: normalizeTemplateLanguage(input.language),
      status: outboundStatus(result),
      metaMessageId: firstMetaMessageId(result) || undefined,
      error: result.ok ? "" : String(result.errorMessage || result.error || ""),
      rawPayload: {
        sender: result.debug?.sender || (input.bypassN8n ? "meta" : "whatsapp"),
        metadata: input.metadata || {},
        response: result.payload || null,
        templateVariables: bodyParameters,
        testMode: result.testMode,
      },
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("WhatsApp outbound template log failed", { error, templateName: input.templateName, phoneNumber });
  }
}

async function sendViaN8n(input: {
  to?: string;
  type?: "template" | "text";
  templateName: string;
  language: string;
  bodyParameters?: string[];
  templateVariables?: string[];
  message?: string;
  metadata?: Record<string, unknown>;
  testMode?: boolean;
  countryCode?: string;
}): Promise<WhatsAppSendResult | null> {
  const webhookUrl = n8nWebhookUrl();
  if (!webhookUrl) return null;
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode, input.countryCode);
  if (!recipient) {
    return {
      ok: false,
      delivered: false,
      skipped: true,
      testMode,
      recipient,
      debug: { sender: "n8n", webhookUrlConfigured: true, reason: "missing_recipient" },
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lms-whatsapp-secret": cleanEnv(process.env.WHATSAPP_N8N_FORWARD_SECRET),
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        type: input.type || "template",
        templateName: input.templateName,
        language: normalizeTemplateLanguage(input.language),
        recipients: [recipient],
        bodyParameters: input.bodyParameters || input.templateVariables || [],
        templateVariables: input.templateVariables || input.bodyParameters || [],
        message: input.message || "",
        metadata: input.metadata || {},
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const first = Array.isArray(payload?.results) ? payload.results[0] : null;
    const ok = Boolean(response.ok && (payload?.ok !== false) && (first ? first.ok !== false : true));
    return {
      ok,
      delivered: ok,
      skipped: false,
      status: response.status,
      payload,
      testMode,
      recipient,
      metaMessageId: first?.metaMessageId || "",
      errorMessage: first?.error || payload?.error || "",
      debug: {
        sender: "n8n",
        webhookUrlConfigured: true,
        type: input.type || "template",
        templateName: input.templateName,
        templateLanguage: normalizeTemplateLanguage(input.language),
        recipient,
        n8nStatus: response.status,
      },
    };
  } catch (error) {
    console.error("WhatsApp n8n request failed", { error, metadata: input.metadata });
    void notifyFailure({ title: "WhatsApp n8n request failed", error, metadata: { automation: "whatsapp_n8n", reminderMetadata: input.metadata, recipient } });
    return {
      ok: false,
      delivered: false,
      skipped: false,
      error: "whatsapp_n8n_failed",
      testMode,
      recipient,
      debug: { sender: "n8n", webhookUrlConfigured: true, error: error instanceof Error ? error.message : String(error || "") },
    };
  }
}

async function postWhatsAppMessage(body: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const { accessToken, phoneNumberId } = whatsappConfig();
  const recipient = String(body.to || "");
  const graphVersion = configuredGraphVersion();
  const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneNumberId || "[missing-phone-number-id]"}/messages`;
  const debug = {
    endpoint,
    graphVersion,
    phoneNumberIdPresent: Boolean(phoneNumberId),
    accessTokenPresent: Boolean(accessToken),
    recipient,
    messageType: body.type,
    templateName: typeof body.template === "object" && body.template ? (body.template as any).name : undefined,
    templateLanguage: typeof body.template === "object" && body.template ? (body.template as any).language?.code : undefined,
  };
  if (!accessToken || !phoneNumberId || !recipient) {
    return { ok: false, delivered: false, skipped: true, recipient, debug };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const metaMessageId = String(payload?.messages?.[0]?.id || "");
    const delivered = response.ok && Boolean(metaMessageId);
    const errorMessage = delivered ? "" : String(payload?.error?.message || payload?.error?.error_user_msg || "");
    if (!delivered) {
      console.error("WhatsApp delivery failed", { status: response.status, payload, metadata, debug });
      void notifyFailure({
        title: "WhatsApp delivery failed",
        error: errorMessage || "WhatsApp API did not confirm delivery",
        metadata: { automation: "whatsapp", status: response.status, payload, reminderMetadata: metadata, debug },
      });
    }
    return { ok: delivered, delivered, skipped: false, status: response.status, payload, debug, errorMessage, recipient, metaMessageId };
  } catch (error) {
    console.error("WhatsApp request failed", { error, debug });
    void notifyFailure({ title: "WhatsApp request failed", error, metadata: { automation: "whatsapp", reminderMetadata: metadata, debug } });
    return { ok: false, delivered: false, skipped: false, error: "whatsapp_failed", recipient, debug };
  }
}

function resolveTemplateParam(raw: string, input: WhatsAppReminderInput, message: string, templateText: string) {
  const metadata = input.metadata || {};
  const replacements: Record<string, unknown> = {
    message,
    templateText,
    student: templateText,
    studentName: templateText,
    ...metadata,
  };

  return raw.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = replacements[String(key).trim()];
    return value === undefined || value === null ? "" : String(value);
  }).trim();
}

function templateBodyParameters(input: WhatsAppReminderInput, message: string, templateText: string) {
  const configuredParams = process.env.WHATSAPP_TEMPLATE_BODY_PARAMS;
  if (configuredParams !== undefined) {
    return configuredParams
      .split("|")
      .map((param) => resolveTemplateParam(param, input, message, templateText).slice(0, 1024))
      .filter(Boolean);
  }

  if (process.env.WHATSAPP_TEMPLATE_HAS_BODY_PARAM === "true") {
    return [templateText];
  }

  return [];
}

export async function sendWhatsAppTemplateMessage(input: WhatsAppTemplateInput) {
  const countryCode = input.countryCode || await countryCodeForUser(input.metadata?.userId);
  const enabled = await isWhatsAppAutomationTemplateEnabled(input.templateName).catch((error) => {
    console.error("WhatsApp automation setting lookup failed", { error, templateName: input.templateName });
    return true;
  });
  if (!enabled) {
    return {
      ok: true,
      delivered: false,
      skipped: true,
      recipient: normalizeWhatsAppRecipient(input.to, countryCode),
      debug: { reason: "whatsapp_template_automation_disabled", templateName: input.templateName },
    };
  }

  const { testMode, recipient } = resolveRecipient(input.to, input.testMode, countryCode);
  const bodyParameters = normalizeTemplateBodyParameters(input.bodyParameters || input.templateVariables || []);
  const metaTemplateName = resolveWhatsAppMetaTemplateName(input.templateName);
  if (!input.bypassN8n) {
    const n8nResult = await sendViaN8n({
      to: input.to,
      templateName: metaTemplateName,
      language: normalizeTemplateLanguage(input.language),
      bodyParameters,
      templateVariables: bodyParameters,
      metadata: { ...(input.metadata || {}), lmsTemplateName: input.templateName, metaTemplateName },
      testMode: input.testMode,
      countryCode,
    });
    if (n8nResult) {
      await recordOutboundTemplateMessage({ ...input, countryCode }, n8nResult, bodyParameters);
      return n8nResult;
    }
  }

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: metaTemplateName,
      language: { code: normalizeTemplateLanguage(input.language) },
      ...(bodyParameters.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  };
  const result = await postWhatsAppMessage(body, input.metadata);
  const output = { ...result, testMode, recipient };
  await recordOutboundTemplateMessage({ ...input, countryCode }, output, bodyParameters);
  return output;
}

export async function sendWhatsAppTextMessage(input: WhatsAppTextInput) {
  const countryCode = input.countryCode || await countryCodeForUser(input.metadata?.userId);
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode, countryCode);
  if (!input.bypassN8n) {
    const n8nResult = await sendViaN8n({
      to: input.to,
      type: "text",
      templateName: "",
      language: "",
      message: String(input.text || "").trim().slice(0, 4000),
      metadata: input.metadata,
      testMode: input.testMode,
      countryCode,
    });
    if (n8nResult) return n8nResult;
  }

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { preview_url: input.previewUrl ?? true, body: String(input.text || "").trim().slice(0, 4000) },
  };
  const result = await postWhatsAppMessage(body, input.metadata);
  return { ...result, testMode, recipient };
}

export async function sendWhatsAppReminder(input: WhatsAppReminderInput) {
  const mode = String(process.env.WHATSAPP_MESSAGE_MODE || "template").toLowerCase();
  const message = String(input.message || "").trim().slice(0, 4000);
  if (mode === "text") {
    return sendWhatsAppTextMessage({ to: input.to, countryCode: input.countryCode, text: message, metadata: input.metadata });
  }

  const templateText = String(input.templateText || message || "Student").trim().slice(0, 1024);
  return sendWhatsAppTemplateMessage({
    to: input.to,
    countryCode: input.countryCode,
    templateName: input.templateName || process.env.WHATSAPP_TEMPLATE_NAME || "jaspers_market_plain_text_v1",
    language: normalizeTemplateLanguage(input.language || process.env.WHATSAPP_TEMPLATE_LANGUAGE),
    bodyParameters: input.templateVariables || templateBodyParameters(input, message, templateText),
    templateVariables: input.templateVariables,
    metadata: input.metadata,
  });
}
