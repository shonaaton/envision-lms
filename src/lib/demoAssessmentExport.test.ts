import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { find: vi.fn() } }));
vi.mock("@/models/Onboarding", () => ({ DemoFeedback: { find: vi.fn() } }));
vi.mock("@/models/Booking", () => ({ Booking: { find: vi.fn() } }));
vi.mock("@/lib/featureAccess", () => ({ canAccessFeature: vi.fn() }));

import { canExportDemoAssessments, demoAssessmentReportSheet } from "@/lib/demoAssessmentExport";
import { canAccessFeature } from "@/lib/featureAccess";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { Booking } from "@/models/Booking";
import { DemoFeedback } from "@/models/Onboarding";
import { User } from "@/models/User";

const ID = "64a000000000000000000001";

function chain(value: any) {
  const query: any = { lean: () => Promise.resolve(value) };
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEMO_SUB_ADMIN_NOTIFY_EMAILS;
  (canAccessFeature as any).mockResolvedValue(false);
  (Booking.find as any).mockReturnValue(chain([]));
});

describe("canExportDemoAssessments", () => {
  it("allows admins", async () => {
    (User.findById as any).mockReturnValue(chain({ role: "admin", email: "a@example.com" }));
    expect(await canExportDemoAssessments(ID)).toBe(true);
  });

  it("allows the demo sub-admin, Saptarshi", async () => {
    (User.findById as any).mockReturnValue(chain({ role: "sub-admin", email: "Saptarshi2856@gmail.com" }));
    expect(await canExportDemoAssessments(ID)).toBe(true);
  });

  it("refuses other sub-admins, including salespeople", async () => {
    (User.findById as any).mockReturnValue(chain({ role: "sub-admin", email: "sayanenvisionchess@gmail.com" }));
    expect(await canExportDemoAssessments(ID)).toBe(false);
  });

  it("allows a role granted Demo Center's export permission, such as Marketing", async () => {
    (User.findById as any).mockReturnValue(chain({ role: "sub-admin", email: "marketing@example.com" }));
    (canAccessFeature as any).mockResolvedValue(true);
    expect(await canExportDemoAssessments(ID)).toBe(true);
    expect(canAccessFeature).toHaveBeenCalledWith("demoCenter", expect.objectContaining({ id: ID }), "export");
  });

  it("refuses a deactivated admin", async () => {
    (User.findById as any).mockReturnValue(chain({ role: "admin", isActive: false }));
    expect(await canExportDemoAssessments(ID)).toBe(false);
  });
});

describe("demoAssessmentReportSheet", () => {
  it("writes a row for every demo lead, assessed or not", async () => {
    const assessedId = "64a0000000000000000000b1";
    (Booking.find as any).mockReturnValue(chain([
      {
        _id: "64a0000000000000000000b0",
        student: { name: "No Show Kid", parentName: "Mira", countryCode: "+91", phone: "9111111111", accountStatus: "demo" },
        assignedCoach: { name: "Coach C" },
        startAt: new Date("2026-09-25T10:30:00Z"),
        demoStatus: "STUDENT_NO_SHOW",
        archivedAt: new Date("2026-09-26T00:00:00Z"),
      },
      { _id: assessedId, student: { name: "Riya", accountStatus: "enrolled" }, demoStatus: "CONVERTED", salesOwnerName: "Sayandeb" },
    ]));
    (DemoFeedback.find as any).mockReturnValue(chain([
      { booking: assessedId, demoUser: { name: "Riya", accountStatus: "enrolled" }, coach: { name: "Coach A" }, status: "submitted" },
    ]));
    const sheet = await demoAssessmentReportSheet();
    const col = (label: string) => sheet.columns.findIndex((column) => column.label === label);
    expect(sheet.rows).toHaveLength(2);
    sheet.rows.forEach((row) => expect(row).toHaveLength(sheet.columns.length));
    expect(sheet.rows[0][col("Student")]).toBe("No Show Kid");
    expect(sheet.rows[0][col("Phone")]).toBe("+91 9111111111");
    expect(sheet.rows[0][col("Demo status")]).toBe("Student no-show");
    expect(sheet.rows[0][col("Archived")]).toBe("Yes");
    expect(sheet.rows[0][col("Coach")]).toBe("Coach C");
    expect(sheet.rows[0][col("Assessment status")]).toBe("Not assessed");
    expect(sheet.rows[1][col("Coach")]).toBe("Coach A");
    expect(sheet.rows[1][col("Demo status")]).toBe("Converted");
    expect(sheet.rows[1][col("Assessment status")]).toBe("Submitted");
  });

  it("writes one full row per assessment, surviving a deleted demo account and booking", async () => {
    const bookingId = "64a0000000000000000000b2";
    (Booking.find as any).mockReturnValue(chain([
      { _id: bookingId, student: null, startAt: new Date("2026-09-20T10:30:00Z"), demoStatus: "CONVERTED", salesOwnerName: "Sayandeb" },
    ]));
    (DemoFeedback.find as any).mockReturnValue(chain([
      {
        demoUser: { name: "Riya", parentName: "Anita", countryCode: "+91", phone: "9000000000", accountStatus: "enrolled" },
        booking: bookingId,
        coach: { name: "Coach A" },
        overallStrength: "",
        coachRecommendation: "group",
        recommendedStartingTopic: "Pins",
        recommendedStartingSession: 12,
        status: "submitted",
        fideRating: 1450,
      },
      { demoUser: null, booking: null, studentName: "Old Lead", coachName: "Coach B", status: "draft" },
    ]));
    const sheet = await demoAssessmentReportSheet();
    expect(sheet.rows).toHaveLength(2);
    sheet.rows.forEach((row) => expect(row).toHaveLength(sheet.columns.length));
    const col = (label: string) => sheet.columns.findIndex((column) => column.label === label);
    expect(sheet.rows[0][col("Phone")]).toBe("+91 9000000000");
    expect(sheet.rows[0][col("Recommended class type")]).toBe("Group");
    expect(sheet.rows[0][col("Starts at")]).toBe("Session 12 - Pins");
    expect(sheet.rows[0][col("Salesperson (lead owner)")]).toBe("Sayandeb");
    expect(sheet.rows[1][col("Student")]).toBe("Old Lead");
    expect(sheet.rows[1][col("Account status")]).toBe("Account deleted");
    expect(sheet.rows[1][col("Assessment status")]).toBe("Draft");
    expect(buildSpreadsheet("xlsx", [sheet]).subarray(0, 2).toString()).toBe("PK");
  });
});
