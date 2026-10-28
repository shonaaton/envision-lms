import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), send: vi.fn(), create: vi.fn(), last: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/featureAccess", () => ({ canAccessFeature: vi.fn(async () => true) }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/whatsappAutomation", () => ({ normalizeWhatsAppNumber: (value: string) => value.replace(/\D/g, ""), findWhatsAppUserByPhone: vi.fn(async () => null), sendWhatsAppTextMessage: mocks.send }));
vi.mock("@/models/WhatsApp", () => ({ WhatsAppMessage: { findOne: () => ({ sort: () => ({ lean: mocks.last }) }), create: mocks.create } }));
vi.mock("@/lib/whatsappSendRequest", () => ({ withWhatsAppSendRequest: mocks.reserve }));
import { POST } from "./route";
import { canAccessFeature } from "@/lib/featureAccess";
const req = (body: unknown) => new Request("http://localhost/api/admin/whatsapp/reply", { method: "POST", body: JSON.stringify(body) });
const body = { phoneNumber: "919999999999", text: "Hello", requestId: "request-1234567890" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(canAccessFeature).mockResolvedValue(true);
  mocks.auth.mockResolvedValue({ user: { id: "staff", role: "admin" } });
  mocks.last.mockResolvedValue({ receivedAt: new Date() }); mocks.create.mockResolvedValue({ _id: "outbound-id" });
  mocks.reserve.mockImplementation(async (_input, send) => { const result = await send(); return Response.json(result.body, { status: result.status || 200 }); });
});
describe("manual reply outcomes", () => {
  it("returns a failed HTTP result and retains provider error details", async () => {
    mocks.send.mockResolvedValue({ ok: false, delivered: false, errorMessage: "Recipient unavailable" });
    const response = await POST(req(body));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, retryable: true, error: "Recipient unavailable" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", text: "Hello" }));
  });
  it("distinguishes provider acceptance from delivery", async () => {
    mocks.send.mockResolvedValue({ ok: true, delivered: true, metaMessageId: "wamid-1" });
    const response = await POST(req(body));
    expect(response.status).toBe(200); expect((await response.json()).ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted", metaMessageId: "wamid-1" }));
  });
  it("does not describe a timed out provider request as safely retryable", async () => {
    mocks.send.mockResolvedValue({ ok: false, delivered: false, error: "whatsapp_n8n_failed" });
    const response = await POST(req(body));
    expect(await response.json()).toMatchObject({ ok: false, uncertain: true, retryable: false });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "queued", uncertain: true }));
  });
  it("checks expiry inside the reservation and never sends outside the window", async () => {
    mocks.last.mockResolvedValue({ receivedAt: new Date(Date.now() - 25 * 3600_000) });
    expect((await POST(req(body))).status).toBe(409);
    expect(mocks.reserve).toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects unauthorised and invalid requests before a send", async () => {
    mocks.auth.mockResolvedValue(null); expect((await POST(req(body))).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { role: "admin" } });
    expect((await POST(req({ ...body, text: "a".repeat(4097) }))).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
