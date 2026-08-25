import crypto from "crypto";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

function verifySignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function findUserByPhone(phoneNumber: string) {
  const variants = Array.from(new Set([
    phoneNumber,
    phoneNumber.replace(/^91/, ""),
    `+${phoneNumber}`,
    `+${phoneNumber.replace(/^91/, "")}`,
  ]));
  return User.findOne({ phone: { $in: variants } }).select("_id name phone email username role").lean();
}

function messageText(message: any) {
  if (message.type === "text") return typeof message.text === "string" ? message.text : String(message.text?.body || "");
  if (message.type === "button") return String(message.button?.text || message.button?.payload || "");
  if (message.type === "interactive") return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "");
  return `[${message.type || "message"}]`;
}

function parseWhatsAppTimestamp(value: unknown) {
  if (!value) return new Date();
  if (typeof value === "number") return new Date(value < 10_000_000_000 ? value * 1000 : value);
  const raw = String(value || "").trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeWebhookPayload(payload: any) {
  if (Array.isArray(payload?.entry)) return payload;
  if (Array.isArray(payload?.messages) || Array.isArray(payload?.statuses)) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: payload.contacts || [],
                messages: payload.messages || [],
                statuses: payload.statuses || [],
              },
            },
          ],
        },
      ],
    };
  }
  if (payload?.direction === "inbound" && payload?.from && (payload?.waMessageId || payload?.providerMessageId || payload?.id)) {
    const text = typeof payload.text === "string" ? { body: payload.text } : payload.text;
    const waId = String(payload.waId || payload.from || "");
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: {
                  phone_number_id: payload.phoneNumberId || payload.phone_number_id || "",
                },
                contacts: payload.contacts || [{ wa_id: waId, profile: { name: payload.profileName || payload.contactName || "" } }],
                messages: [
                  {
                    from: waId,
                    id: String(payload.waMessageId || payload.providerMessageId || payload.id || ""),
                    timestamp: payload.timestamp,
                    text,
                    type: payload.type || "text",
                    ...payload,
                  },
                ],
                statuses: [],
              },
            },
          ],
        },
      ],
    };
  }
  if (payload?.from && payload?.id && payload?.type) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: payload.contacts || [],
                messages: [payload],
                statuses: [],
              },
            },
          ],
        },
      ],
    };
  }
  if (payload?.status && payload?.id) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: payload.contacts || [],
                messages: [],
                statuses: [payload],
              },
            },
          ],
        },
      ],
    };
  }
  return payload;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const forwardSecret = process.env.WHATSAPP_N8N_FORWARD_SECRET;
  if (forwardSecret && req.headers.get("x-lms-whatsapp-secret") !== forwardSecret) {
    return NextResponse.json({ error: "Invalid forwarding secret" }, { status: 401 });
  }
  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = normalizeWebhookPayload(JSON.parse(rawBody || "{}"));
  await dbConnect();

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = new Map((value.contacts || []).map((contact: any) => [String(contact.wa_id || ""), contact]));

      for (const status of value.statuses || []) {
        const metaMessageId = String(status.id || "");
        if (!metaMessageId) continue;
        await WhatsAppMessage.updateOne(
          { metaMessageId },
          {
            $set: {
              status: String(status.status || "sent"),
              rawPayload: status,
            },
          }
        );
      }

      for (const message of value.messages || []) {
        const metaMessageId = String(message.id || message.waMessageId || message.providerMessageId || "");
        if (!metaMessageId) continue;
        const waId = String(message.from || "");
        const phoneNumber = normalizeWhatsAppNumber(waId);
        const contact: any = contacts.get(waId) || {};
        const profileName = String(contact.profile?.name || "");
        const matchedUser: any = await findUserByPhone(phoneNumber);
        await WhatsAppMessage.updateOne(
          { metaMessageId },
          {
            $setOnInsert: {
              phoneNumber,
              waId,
              contactName: matchedUser?.name || profileName,
              profileName,
              matchedUser: matchedUser?._id,
              direction: "inbound",
              messageType: String(message.type || "text"),
              text: messageText(message),
              status: "received",
              metaMessageId,
              rawPayload: message,
              receivedAt: parseWhatsAppTimestamp(message.timestamp),
            },
          },
          { upsert: true }
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
