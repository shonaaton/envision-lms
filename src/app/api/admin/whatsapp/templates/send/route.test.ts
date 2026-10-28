import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), scope: vi.fn(), approved: vi.fn(), send: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/whatsappAccess", () => ({ whatsappSession: mocks.session, canAccessWhatsAppPhone: mocks.scope }));
vi.mock("@/lib/whatsappTemplateLibrary", () => ({ getApprovedLibraryTemplate: mocks.approved }));
vi.mock("@/lib/whatsappLibrarySend", () => ({ sendLibraryTemplate: mocks.send }));
vi.mock("@/lib/whatsappSendRequest", () => ({ withWhatsAppSendRequest: mocks.reserve }));
import { POST } from "./route";
import { WhatsAppMetaError } from "@/lib/whatsappMeta";
const template = { id: "100000000000000000000001", name: "class_update", contentVersion: "a".repeat(64), sendable: true };
const input = { templateId: template.id, contentVersion: template.contentVersion, phoneNumber: "919999999991", values: ["Aarav"], requestId: "test-template-send-123456" };
const request = (body: unknown = input) => new Request("http://localhost/api/admin/whatsapp/templates/send", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: "actor-test", role: "instructor" }); mocks.scope.mockResolvedValue(true);
  mocks.approved.mockResolvedValue(template); mocks.send.mockResolvedValue({ ok: true, status: "accepted" });
  mocks.reserve.mockImplementation(async (_input, run) => { const result = await run(); return NextResponse.json(result.body, { status: result.status || 200 }); });
});
describe("approved template sending", () => {
  it("requires permission and an assigned conversation for coaches", async () => {
    mocks.session.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    mocks.scope.mockResolvedValueOnce(false); expect((await POST(request())).status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("requires a version of the preview that the staff member reviewed", async () => {
    expect((await POST(request({ ...input, contentVersion: undefined }))).status).toBe(400);
    expect(mocks.approved).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks a changed template before contacting the message provider", async () => {
    mocks.approved.mockResolvedValue({ ...template, contentVersion: "b".repeat(64) });
    const result = await POST(request()); expect(result.status).toBe(409); expect((await result.json()).error).toMatch(/changed since this preview/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks approval and preserves the exact reviewed version in the reservation", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.approved).toHaveBeenCalledWith(template.id);
    expect(mocks.reserve.mock.calls[0][0].payload).toMatchObject({ contentVersion: template.contentVersion, phoneNumber: input.phoneNumber });
    expect(mocks.send).toHaveBeenCalledWith({ template, phoneNumber: input.phoneNumber, values: ["Aarav"], actorId: "actor-test" });
  });
  it("blocks approval revoked after the dialog was opened", async () => {
    mocks.approved.mockRejectedValue(new WhatsAppMetaError("This template is paused and cannot be sent.", 409));
    expect((await POST(request())).status).toBe(409); expect(mocks.send).not.toHaveBeenCalled();
  });
});
