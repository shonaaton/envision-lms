import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), update: vi.fn(), create: vi.fn(), graph: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/whatsappAccess", () => ({ whatsappSession: mocks.session }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/WhatsAppTemplate", () => ({ WhatsAppTemplate: { init: vi.fn(), findOne: () => ({ lean: mocks.find }), findOneAndUpdate: mocks.update, create: mocks.create, updateOne: vi.fn() } }));
vi.mock("@/lib/whatsappMeta", async (original) => ({ ...await original<any>(), whatsappMetaConfig: () => ({ businessAccountId: "waba-test", accessToken: "fake-test-token", graphVersion: "v25.0" }), whatsappGraph: mocks.graph }));
vi.mock("@/lib/whatsappTemplateLibrary", async (original) => ({ ...await original<any>(), syncTemplateLibrary: mocks.sync }));
import { POST as save } from "./route";
import { POST as submit } from "./[id]/submit/route";
const id = String(new Types.ObjectId());
const draft = { _id: new Types.ObjectId(id), businessAccountId: "waba-test", name: "class_notice", language: "en_US", category: "UTILITY", body: "Hello {{1}}, your class starts at 6 PM.", header: "", footer: "", variables: [{ position: 1, key: "Student", sample: "Aarav" }], buttons: [], status: "DRAFT", revision: 1 };
const req = (body: unknown) => new Request("http://localhost/api/admin/whatsapp/templates/library", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: String(new Types.ObjectId()), role: "admin" });
  mocks.find.mockResolvedValue(draft); mocks.create.mockImplementation(async (value) => ({ ...value, _id: id }));
  mocks.update.mockImplementation((_filter, update) => ({ lean: async () => ({ ...draft, ...update.$set, revision: 2 }) }));
  mocks.graph.mockResolvedValue({ id: "meta-id-123", status: "PENDING", category: "UTILITY" });
});
describe("template draft to Meta review lifecycle", () => {
  it("saves a local draft without contacting Meta", async () => {
    const response = await save(req(draft)); expect(response.status).toBe(201);
    expect((await response.json()).template.sendable).toBe(false); expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("requires management access and disallows coach submissions", async () => {
    mocks.session.mockResolvedValue({ id, role: "instructor" });
    expect((await save(req(draft))).status).toBe(403);
    expect((await submit(req({ revision: 1 }), { params: { id } })).status).toBe(403);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("submits the saved revision with exact language and example values", async () => {
    const response = await submit(req({ revision: 1 }), { params: { id } });
    expect(response.status).toBe(200); expect((await response.json()).template.status).toBe("PENDING");
    const payload = JSON.parse(mocks.graph.mock.calls[0][1].body);
    expect(payload).toMatchObject({ name: "class_notice", language: "en_US", category: "UTILITY" });
    expect(payload.components[0]).toMatchObject({ type: "BODY", example: { body_text: [["Aarav"]] } });
  });
  it("does not submit again when the saved revision is stale or already reserved", async () => {
    mocks.update.mockReturnValue({ lean: async () => null });
    expect((await submit(req({ revision: 0 }), { params: { id } })).status).toBe(409);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("preserves unknown outcomes so a timed-out submit cannot be blindly repeated", async () => {
    const { WhatsAppMetaError } = await import("@/lib/whatsappMeta");
    mocks.graph.mockRejectedValue(new WhatsAppMetaError("No confirmed response", 502, true));
    const response = await submit(req({ revision: 1 }), { params: { id } });
    expect(response.status).toBe(502); expect((await response.json()).uncertain).toBe(true);
    const { WhatsAppTemplate } = await import("@/models/WhatsAppTemplate");
    expect(WhatsAppTemplate.updateOne).toHaveBeenCalledWith(expect.objectContaining({ status: "SUBMITTING" }), { $set: expect.objectContaining({ status: "SUBMISSION_UNKNOWN" }) });
  });
  it("prevents editing a submitted template as if it were a draft", async () => {
    mocks.update.mockReturnValue({ lean: async () => null });
    expect((await save(req({ ...draft, id, revision: 1 }))).status).toBe(409);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ status: { $in: ["DRAFT", "SUBMISSION_FAILED"] }, revision: 1 });
  });
});
