import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/emailAutomation", () => ({ sendAutomationEmail: vi.fn() }));
vi.mock("@/lib/whatsappAutomationEvents", () => ({ sendWhatsAppAutomationTemplates: vi.fn() }));
vi.mock("@/lib/tasks/taskTriggers", () => ({ raiseLeadFollowUpTask: vi.fn(), reassignLeadTasks: vi.fn() }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { find: vi.fn() } }));
vi.mock("@/models/Booking", () => ({ Booking: { findById: vi.fn() } }));
vi.mock("@/models/CrmLeadRecord", () => ({ CrmLeadRecord: { find: vi.fn() } }));
vi.mock("@/models/Fee", () => ({ Notification: {} }));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), find: vi.fn() } }));

import { demoOwnerRestriction, ownsDemoLead } from "@/lib/demoLeadOwner";
import { AccessRole } from "@/models/AccessRole";
import { Booking } from "@/models/Booking";
import { User } from "@/models/User";

const SALES_ROLE = "64b000000000000000000001";
const ALICE = "64a000000000000000000001";
const BOB = "64a000000000000000000002";
const BOOKING = "64c000000000000000000001";
const STUDENT = "64d000000000000000000001";

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  (AccessRole.find as any).mockReturnValue(chain([{ _id: SALES_ROLE }]));
});

describe("demoOwnerRestriction", () => {
  it("restricts a sub-admin on the Sales role to their own leads", async () => {
    (User.findById as any).mockReturnValue(chain({ accessRole: SALES_ROLE }));
    expect(await demoOwnerRestriction(ALICE)).toBe(ALICE);
  });

  it("leaves admins and plain sub-admins unrestricted", async () => {
    (User.findById as any).mockReturnValue(chain({ accessRole: null }));
    expect(await demoOwnerRestriction(ALICE)).toBe("");
  });
});

describe("ownsDemoLead", () => {
  it("lets the assigned salesperson act on their demo", async () => {
    (Booking.findById as any).mockReturnValue(chain({ salesOwner: ALICE, student: STUDENT }));
    expect(await ownsDemoLead(ALICE, { bookingId: BOOKING })).toBe(true);
  });

  it("blocks another salesperson's demo", async () => {
    (Booking.findById as any).mockReturnValue(chain({ salesOwner: BOB, student: STUDENT }));
    expect(await ownsDemoLead(ALICE, { bookingId: BOOKING })).toBe(false);
  });

  it("blocks a student id that does not belong to the posted booking", async () => {
    (Booking.findById as any).mockReturnValue(chain({ salesOwner: ALICE, student: STUDENT }));
    expect(await ownsDemoLead(ALICE, { bookingId: BOOKING, studentId: "64d000000000000000000009" })).toBe(false);
  });

  it("does not restrict an unrestricted viewer", async () => {
    expect(await ownsDemoLead("", { bookingId: BOOKING })).toBe(true);
  });
});
