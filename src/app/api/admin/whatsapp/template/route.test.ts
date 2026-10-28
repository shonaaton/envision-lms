import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), users: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/WhatsApp", () => ({ WhatsAppMessage: { create: mocks.create } }));
vi.mock("@/models/User", () => ({ User: { find: () => ({ select: () => ({ lean: mocks.users }) }) } }));
vi.mock("@/lib/whatsappAutomation", () => ({ normalizeWhatsAppNumber: (value: string) => value.replace(/\D/g, ""), normalizeWhatsAppRecipient: (value: string) => value.replace(/\D/g, ""), findWhatsAppUserByPhone: vi.fn(async () => null) }));
vi.mock("@/lib/whatsappSendRequest", () => ({ withWhatsAppSendRequest: mocks.reserve }));
import { POST } from "./route";
const phone = "919999999999";
const req = (body: unknown) => new Request("http://localhost/api/admin/whatsapp/template", { method: "POST", body: JSON.stringify(body) });
const body = { templateName: "hello_world_2", language: "en", recipients: [phone], templateVariables: [], requestId: "request-1234567890" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "staff", role: "admin" } });
  mocks.reserve.mockImplementation(async (_input, send) => { const result = await send(); return Response.json(result.body, { status: result.status || 200 }); });
  process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL = "https://provider.invalid/isolated-test";
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL; });
describe("manual template safety and results", () => {
  it("rejects an empty recipient selection without falling back to preset numbers", async () => {
    const response = await POST(req({ ...body, recipients: [] }));
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("records a webhook acknowledgement without per-recipient results as queued", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
    const payload = await (await POST(req(body))).json();
    expect(payload.results[0]).toMatchObject({ ok: true, status: "queued", phoneNumber: phone });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" }));
  });
  it("does not turn an explicit failed provider result into a successful send", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ phoneNumber: phone, ok: true, status: "failed", metaMessageId: "wamid-1", error: "Recipient unavailable" }] }));
    const payload = await (await POST(req(body))).json();
    expect(payload.ok).toBe(false); expect(payload.results[0].ok).toBe(false);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "Recipient unavailable" }));
  });
  it("does not label a rejected batch as queued just because the webhook returned HTTP 200", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: false, error: "Template was rejected" }));
    const response = await POST(req(body));
    expect(response.status).toBe(502); expect(await response.json()).toMatchObject({ ok: false, error: "Template was rejected" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports omitted recipients as unconfirmed rather than silently succeeding", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ phoneNumber: phone, ok: true, status: "accepted" }] }));
    const payload = await (await POST(req({ ...body, recipients: [phone, "918888888888"] }))).json();
    expect(payload.ok).toBe(false); expect(payload.results).toHaveLength(2);
    expect(payload.results[1]).toMatchObject({ phoneNumber: "918888888888", status: "unconfirmed", ok: false });
  });
  it("reserves the group selection so replay does not depend on a changed membership list", async () => {
    mocks.users.mockResolvedValue([{ phone }]); vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
    await POST(req({ ...body, recipientGroup: "students", recipients: [] }));
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ recipientGroup: "students", recipients: [] }) }), expect.any(Function));
  });
});
