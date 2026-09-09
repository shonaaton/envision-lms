import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { find: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: { find: vi.fn() } }));

import {
  SALES_ACCESS_ROLE_NAME_KEY,
  dedupeDemoRecipients,
  demoFeedbackNotificationRecipients,
  demoNotificationRecipients,
  demoSubAdminEmails,
  type DemoStaffRecipient,
} from "@/lib/demoNotificationRecipients";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";

/** Mongoose chains (`.select().sort().lean()`) resolve to the same rows at any depth. */
function chain(rows: any[]) {
  const query: any = { lean: () => Promise.resolve(rows) };
  query.select = () => query;
  query.sort = () => query;
  return query;
}

const SALES_ROLE_ID = "sales-role-id";

function staff(overrides: Partial<Record<string, any>> = {}) {
  return { _id: "u1", name: "Sales One", email: "sales.one@example.com", phone: "9000000001", countryCode: "+91", ...overrides };
}

/** Answer `User.find` from the filter it was handed, the way Mongo would. */
function userDirectory(rows: any[]) {
  (User.find as any).mockImplementation((filter: any) => {
    if (filter?.accessRole) {
      const allowed = new Set(filter.accessRole.$in.map(String));
      return chain(rows.filter((row) => allowed.has(String(row.accessRole))));
    }
    const byRole = rows.filter((row) => row.role === filter?.role);
    if (!filter?.email) return chain(byRole);
    const emails = new Set((filter.email.$in || []).map(String));
    return chain(byRole.filter((row) => emails.has(row.email)));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.DEMO_SUB_ADMIN_NOTIFY_EMAILS;
  delete process.env.LMS_IMPORTANT_CONTACTS;
  (AccessRole.find as any).mockReturnValue(chain([{ _id: SALES_ROLE_ID }]));
});

afterEach(() => {
  delete process.env.DEMO_SUB_ADMIN_NOTIFY_EMAILS;
  delete process.env.LMS_IMPORTANT_CONTACTS;
});

describe("demoSubAdminEmails", () => {
  it("defaults to the demo sub-admin", () => {
    expect(demoSubAdminEmails()).toEqual(["saptarshi2856@gmail.com"]);
  });

  it("takes an override list, normalised", () => {
    process.env.DEMO_SUB_ADMIN_NOTIFY_EMAILS = " Lead@Example.com ,, ops@example.com ";
    expect(demoSubAdminEmails()).toEqual(["lead@example.com", "ops@example.com"]);
  });
});

describe("dedupeDemoRecipients", () => {
  const base: DemoStaffRecipient = { userId: "", name: "", email: "", phone: "", countryCode: "", role: "sales" };

  it("messages a salesperson who is also the demo sub-admin only once", () => {
    const result = dedupeDemoRecipients([
      { ...base, userId: "u1", name: "Saptarshi", email: "s@example.com", phone: "9000000000" },
      { ...base, userId: "u1", name: "Saptarshi", email: "s@example.com", phone: "9000000000", role: "sub_admin" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("sales");
  });

  it("drops accounts with neither a phone nor an email", () => {
    expect(dedupeDemoRecipients([{ ...base, userId: "u2", name: "No Contact" }])).toEqual([]);
  });
});

describe("demoNotificationRecipients", () => {
  it("reads the sales team from the live user directory", async () => {
    userDirectory([
      staff({ _id: "u1", accessRole: SALES_ROLE_ID }),
      staff({ _id: "u2", name: "Sales Two", email: "sales.two@example.com", phone: "9000000002", accessRole: SALES_ROLE_ID }),
      staff({ _id: "u3", name: "Coach", email: "coach@example.com", accessRole: "other-role" }),
    ]);
    const { sales } = await demoNotificationRecipients();
    expect((AccessRole.find as any).mock.calls[0][0]).toMatchObject({ nameKey: SALES_ACCESS_ROLE_NAME_KEY, isActive: true });
    expect(sales.map((person) => person.email)).toEqual(["sales.one@example.com", "sales.two@example.com"]);
    // The phone and its country code come from the record, not a constant.
    expect(sales[0]).toMatchObject({ userId: "u1", phone: "9000000001", countryCode: "+91", role: "sales" });
  });

  it("picks the demo sub-admin out of the directory by email", async () => {
    userDirectory([
      staff({ _id: "u9", name: "Saptarshi", email: "saptarshi2856@gmail.com", phone: "9230534866", role: "sub-admin" }),
      staff({ _id: "u8", name: "Other Sub Admin", email: "other@example.com", phone: "9000000008", role: "sub-admin" }),
    ]);
    const { subAdmins, all } = await demoNotificationRecipients();
    // Only the configured email, not every sub-admin on the platform.
    expect(subAdmins.map((person) => person.name)).toEqual(["Saptarshi"]);
    expect(all.map((person) => person.email)).toContain("saptarshi2856@gmail.com");
    expect(all.map((person) => person.email)).not.toContain("other@example.com");
  });

  it("sends to the sales team and the sub-admin together", async () => {
    userDirectory([
      staff({ _id: "u1", accessRole: SALES_ROLE_ID }),
      staff({ _id: "u9", name: "Saptarshi", email: "saptarshi2856@gmail.com", phone: "9230534866", role: "sub-admin" }),
    ]);
    const { all } = await demoNotificationRecipients();
    expect(all.map((person) => person.role)).toEqual(["sales", "sub_admin"]);
  });

  it("falls back to the configured contacts rather than notifying nobody", async () => {
    userDirectory([]);
    const { sales, subAdmins } = await demoNotificationRecipients();
    expect(sales.map((person) => person.phone)).toEqual(["916291780127"]);
    expect(subAdmins.map((person) => person.phone)).toEqual(["919230534866"]);
  });

  it("keeps the live record when only one side is missing", async () => {
    userDirectory([staff({ _id: "u1", accessRole: SALES_ROLE_ID })]);
    const { sales, subAdmins } = await demoNotificationRecipients();
    expect(sales.map((person) => person.userId)).toEqual(["u1"]);
    expect(subAdmins.map((person) => person.userId)).toEqual([""]);
  });
});

describe("demoFeedbackNotificationRecipients", () => {
  /** Sayandeb holds the sales role; Sayan Bose and Saptarshi are sub-admins. */
  function academyStaff() {
    return [
      staff({ _id: "sayandeb", name: "Sayandeb", email: "sayanenvisionchess@gmail.com", phone: "6291780127", accessRole: SALES_ROLE_ID }),
      staff({ _id: "sayan_bose", name: "Sayan Bose", email: "sayanthsbose@gmail.com", phone: "9804470707", role: "sub-admin" }),
      staff({ _id: "saptarshi", name: "Saptarshi", email: "saptarshi2856@gmail.com", phone: "9230534866", role: "sub-admin" }),
      staff({ _id: "coach", name: "Coach", email: "coach@example.com", phone: "9000000009", role: "instructor" }),
    ];
  }

  it("reaches the sales team and every sub-admin", async () => {
    userDirectory(academyStaff());
    const { all } = await demoFeedbackNotificationRecipients();
    expect(all.map((person) => person.userId)).toEqual(["sayandeb", "sayan_bose", "saptarshi"]);
  });

  it("leaves coaches and students out of it", async () => {
    userDirectory(academyStaff());
    const { all } = await demoFeedbackNotificationRecipients();
    expect(all.map((person) => person.email)).not.toContain("coach@example.com");
  });

  it("is wider than the demo-request list, which stops at one sub-admin", async () => {
    userDirectory(academyStaff());
    const [request, feedback] = await Promise.all([demoNotificationRecipients(), demoFeedbackNotificationRecipients()]);
    expect(request.subAdmins.map((person) => person.userId)).toEqual(["saptarshi"]);
    expect(feedback.subAdmins.map((person) => person.userId)).toEqual(["sayan_bose", "saptarshi"]);
  });

  it("notifies a salesperson who is also a sub-admin only once", async () => {
    userDirectory([
      staff({ _id: "sayan_bose", name: "Sayan Bose", email: "sayanthsbose@gmail.com", phone: "9804470707", role: "sub-admin", accessRole: SALES_ROLE_ID }),
    ]);
    const { all } = await demoFeedbackNotificationRecipients();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ userId: "sayan_bose", role: "sales" });
  });

  it("falls back to the configured sub-admins rather than notifying nobody", async () => {
    userDirectory([staff({ _id: "sayandeb", accessRole: SALES_ROLE_ID })]);
    const { subAdmins } = await demoFeedbackNotificationRecipients();
    expect(subAdmins.map((person) => person.name)).toEqual(["Saptarshi", "Dhritabrata", "Sayan Bose"]);
  });
});
