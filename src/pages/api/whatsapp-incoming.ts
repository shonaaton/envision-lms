import type { NextApiRequest, NextApiResponse } from "next";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

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
  return payload || { entry: [] };
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

async function findUserByPhone(phoneNumber: string) {
  const variants = Array.from(new Set([
    phoneNumber,
    phoneNumber.replace(/^91/, ""),
    `+${phoneNumber}`,
    `+${phoneNumber.replace(/^91/, "")}`,
  ]));
  return User.findOne({ phone: { $in: variants } }).select("_id name phone email username role").lean();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return res.status(403).json({ error: "Forbidden" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const forwardSecret = process.env.WHATSAPP_N8N_FORWARD_SECRET;
  if (forwardSecret && req.headers["x-lms-whatsapp-secret"] !== forwardSecret) {
    return res.status(401).json({ error: "Invalid forwarding secret" });
  }

  const payload = normalizeWebhookPayload(req.body);
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

  return res.status(200).json({ ok: true });
}
