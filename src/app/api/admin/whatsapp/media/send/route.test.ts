import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), inbound: vi.fn(), graph: vi.fn(), send: vi.fn(), create: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/whatsappAccess", () => ({ whatsappSession: mocks.session, canAccessWhatsAppPhone: mocks.access }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/whatsappAutomation", () => ({ findWhatsAppUserByPhone: vi.fn(async () => null) }));
vi.mock("@/lib/whatsappMeta", async (original) => ({ ...await original<any>(), whatsappGraph: mocks.graph, sendGraphMessage: mocks.send, whatsappMetaConfig: () => ({ phoneNumberId: "phone-test" }) }));
vi.mock("@/models/WhatsApp", () => ({ WhatsAppMessage: { findOne: () => ({ sort: () => ({ lean: mocks.inbound }) }), create: mocks.create } }));
vi.mock("@/lib/whatsappSendRequest", () => ({ withWhatsAppSendRequest: mocks.reserve }));
import { POST } from "./route";
const req = (name = "Lesson.pgn", content = '[Event "Training"]\n\n1. e4 e5 *') => { const form = new FormData(); form.set("phoneNumber", "919999999999"); form.set("requestId", "request-1234567890"); form.set("caption", "Today’s homework"); form.set("file", new Blob([content]), name); return new Request("http://localhost/api/admin/whatsapp/media/send", { method: "POST", body: form }); };
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: "staff", role: "admin" }); mocks.access.mockResolvedValue(true);
  mocks.inbound.mockResolvedValue({ receivedAt: new Date() }); mocks.graph.mockResolvedValue({ id: "media-1" }); mocks.send.mockResolvedValue({ status: "accepted", metaMessageId: "wamid-media-1" }); mocks.create.mockResolvedValue({ _id: "message-1" });
  mocks.reserve.mockImplementation(async (_input, send) => { const result = await send(); return Response.json(result.body, { status: result.status || 200 }); });
});
describe("attachment sending boundary", () => {
  it("uploads a PGN as a text document and keeps its filename when sending", async () => {
    expect((await POST(req())).status).toBe(200);
    const form: FormData = mocks.graph.mock.calls[0][1].body; expect(form.get("type")).toBe("text/plain");
    expect(mocks.send).toHaveBeenCalledWith({ to: "919999999999", type: "document", document: { id: "media-1", caption: "Today’s homework", filename: "Lesson.pgn" } });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ messageType: "document", mediaId: "media-1", mediaFilename: "Lesson.pgn", status: "accepted" }));
  });
  it("does not upload or send outside the reply window", async () => {
    mocks.inbound.mockResolvedValue({ receivedAt: new Date(Date.now() - 25 * 3600_000) });
    expect((await POST(req())).status).toBe(409); expect(mocks.graph).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send files from an unassigned conversation", async () => {
    mocks.access.mockResolvedValue(false); expect((await POST(req())).status).toBe(403); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("rejects disguised file contents before touching Meta", async () => {
    expect((await POST(req("image.jpg", "not a JPEG"))).status).toBe(400); expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("keeps a lost send response unconfirmed, without inviting an automatic resend", async () => {
    const { WhatsAppMetaError } = await import("@/lib/whatsappMeta"); mocks.send.mockRejectedValue(new WhatsAppMetaError("No response", 502, true));
    const response = await POST(req()); expect(response.status).toBe(502); expect(await response.json()).toMatchObject({ uncertain: true, retryable: false });
  });
  it("allows a confirmed upload failure to be retried because no customer message was submitted", async () => {
    const { WhatsAppMetaError } = await import("@/lib/whatsappMeta"); mocks.graph.mockRejectedValue(new WhatsAppMetaError("Upload interrupted", 502, true));
    const response = await POST(req()); expect(await response.json()).toMatchObject({ uncertain: false, retryable: true }); expect(mocks.send).not.toHaveBeenCalled();
  });
});
