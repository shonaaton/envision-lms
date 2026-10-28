import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppSendRequest, withWhatsAppSendRequest } from "./whatsappSendRequest";

const records = new Map<string, any>();
const input = { key: "request-1234567890", actorId: "admin-a", kind: "reply" as const, payload: { phoneNumber: "919999999999", text: "Hello" } };
beforeEach(() => {
  vi.restoreAllMocks(); records.clear();
  vi.spyOn(WhatsAppSendRequest, "init").mockResolvedValue(WhatsAppSendRequest);
  vi.spyOn(WhatsAppSendRequest, "create").mockImplementation(async (record: any) => {
    if (records.has(record._id)) throw { code: 11000 };
    records.set(record._id, { ...record, state: "processing" }); return record;
  });
  vi.spyOn(WhatsAppSendRequest, "findById").mockImplementation((id: any) => ({ lean: async () => records.get(id) }) as any);
  vi.spyOn(WhatsAppSendRequest, "updateOne").mockImplementation((filter: any, update: any) => {
    Object.assign(records.get(filter._id), update.$set); return Promise.resolve({}) as any;
  });
});

describe("manual WhatsApp send reservations", () => {
  it("replays the original result without another provider request", async () => {
    const send = vi.fn(async () => ({ body: { ok: true, messageId: "message-1" } }));
    expect(await (await withWhatsAppSendRequest(input, send)).json()).toEqual({ ok: true, messageId: "message-1" });
    expect(await (await withWhatsAppSendRequest(input, send)).json()).toEqual({ ok: true, messageId: "message-1" });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("blocks concurrent submissions before the first send finishes", async () => {
    let finish!: (value: any) => void;
    const send = vi.fn(() => new Promise<any>((resolve) => { finish = resolve; }));
    const first = withWhatsAppSendRequest(input, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const duplicate = await withWhatsAppSendRequest(input, send);
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).retryable).toBe(false);
    finish({ body: { ok: true } }); await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains a reservation when logging fails after a possible send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(async () => { throw new Error("logging unavailable after acceptance"); });
    expect((await withWhatsAppSendRequest(input, send)).status).toBe(502);
    expect((await withWhatsAppSendRequest(input, send)).status).toBe(409);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects a reused key with different content and validates missing keys", async () => {
    const send = vi.fn(async () => ({ body: { ok: true } }));
    await withWhatsAppSendRequest(input, send);
    expect((await withWhatsAppSendRequest({ ...input, payload: { text: "Different" } }, send)).status).toBe(409);
    expect((await withWhatsAppSendRequest({ ...input, key: "" }, send)).status).toBe(400);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("replays failures accurately and isolates different staff members", async () => {
    const send = vi.fn(async () => ({ body: { ok: false, error: "Recipient unavailable" }, status: 502 }));
    await withWhatsAppSendRequest(input, send);
    const replay = await withWhatsAppSendRequest(input, send);
    expect(replay.status).toBe(502); expect((await replay.json()).ok).toBe(false);
    await withWhatsAppSendRequest({ ...input, actorId: "admin-b" }, send);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
