import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/models/CrmLeadRecord", () => ({ CrmLeadRecord: { find: vi.fn() } }));

import { phoneKey } from "@/lib/crm/identity";
import { crmStagesForStudents } from "@/lib/crm/leadStage";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  query.sort = () => query;
  return query;
}

const LEAD = { _id: "64a0000000000000000000a1", phone: "9000000001", email: "lead@example.com" };
const SIBLING = { _id: "64a0000000000000000000a2", phone: "9000000001", email: "sibling@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRM_CLOSED_STAGES;
  delete process.env.CRM_DEMO_STAGES;
  delete process.env.CRM_HOLD_STAGES;
  delete process.env.CRM_CONVERTED_STAGES;
});

describe("crmStagesForStudents", () => {
  it("marks Dead and No Response leads as closed, and early-funnel stages as open", async () => {
    (CrmLeadRecord.find as any).mockReturnValue(chain([
      { portalUser: LEAD._id, stage: "Dead", stageChangedAt: new Date("2026-10-05T10:00:00Z") },
      { portalUser: SIBLING._id, stage: "Fresh Lead" },
    ]));
    const stages = await crmStagesForStudents([LEAD, SIBLING]);
    expect(stages.get(LEAD._id)).toMatchObject({ stage: "Dead", closed: true });
    expect(stages.get(SIBLING._id)).toMatchObject({ stage: "Fresh Lead", closed: false });

    (CrmLeadRecord.find as any).mockReturnValue(chain([{ portalUser: LEAD._id, stage: "No Response" }]));
    expect((await crmStagesForStudents([LEAD])).get(LEAD._id)?.closed).toBe(true);
  });

  it("follows the family's lead by phone when it is linked to a sibling's account", async () => {
    // Kraya has one lead per phone; here it is linked to the sibling, and Dead.
    (CrmLeadRecord.find as any).mockReturnValue(chain([{ portalUser: SIBLING._id, phoneKey: phoneKey("9000000001"), stage: "Dead" }]));
    process.env.CRM_CLOSED_STAGES = "No Response,Deleted,Dead";
    const stages = await crmStagesForStudents([{ ...LEAD, phone: "+91 9000000001" }]);
    expect(stages.get(LEAD._id)).toMatchObject({ stage: "Dead", closed: true });
  });

  it("prefers the student's own linked lead over the family phone", async () => {
    (CrmLeadRecord.find as any).mockReturnValue(chain([
      { portalUser: SIBLING._id, phoneKey: phoneKey("9000000001"), stage: "Dead" },
      { portalUser: LEAD._id, phoneKey: phoneKey("9000000001"), stage: "Demo Requested" },
    ]));
    const stages = await crmStagesForStudents([LEAD]);
    expect(stages.get(LEAD._id)).toMatchObject({ stage: "Demo Requested", closed: false });
  });

  it("honours a pinned closed-stage list: only the stages on it close", async () => {
    process.env.CRM_CLOSED_STAGES = "No Response,Deleted";
    (CrmLeadRecord.find as any).mockReturnValue(chain([{ portalUser: LEAD._id, stage: "Dead" }]));
    expect((await crmStagesForStudents([LEAD])).get(LEAD._id)?.closed).toBe(false);
    process.env.CRM_CLOSED_STAGES = "No Response,Deleted,Dead,Not Intersted";
    expect((await crmStagesForStudents([LEAD])).get(LEAD._id)?.closed).toBe(true);
    (CrmLeadRecord.find as any).mockReturnValue(chain([{ portalUser: LEAD._id, stage: "Not Intersted" }]));
    expect((await crmStagesForStudents([LEAD])).get(LEAD._id)?.closed).toBe(true);
  });

  it("leaves a student with no CRM lead out of the map", async () => {
    (CrmLeadRecord.find as any).mockReturnValue(chain([]));
    expect((await crmStagesForStudents([LEAD])).has(LEAD._id)).toBe(false);
    expect(await crmStagesForStudents([])).toEqual(new Map());
  });
});
