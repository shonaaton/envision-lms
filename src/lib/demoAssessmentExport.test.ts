import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/AccessRole", () => ({ AccessRole: { find: vi.fn() } }));
vi.mock("@/models/Onboarding", () => ({ DemoFeedback: { find: vi.fn() } }));
vi.mock("@/models/Booking", () => ({ Booking: { find: vi.fn() } }));
vi.mock("@/models/Activity", () => ({ Activity: { find: vi.fn() } }));
vi.mock("@/models/CrmLeadRecord", () => ({ CrmLeadRecord: { find: vi.fn() } }));
vi.mock("@/lib/featureAccess", () => ({ canAccessFeature: vi.fn() }));

import { canExportDemoAssessments, demoAssessmentReportSheet, demoLeadReportSheets, demoLeadStage } from "@/lib/demoAssessmentExport";
import { canAccessFeature } from "@/lib/featureAccess";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { Activity } from "@/models/Activity";
import { Booking } from "@/models/Booking";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";
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
  (User.find as any).mockReturnValue(chain([]));
  (Activity.find as any).mockReturnValue(chain([]));
  (CrmLeadRecord.find as any).mockReturnValue(chain([]));
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

describe("demoLeadStage", () => {
  const now = new Date("2026-10-06T09:00:00Z").getTime();
  const booking = (fields: any) => ({ _id: "b", ...fields });

  it("names the Demo Center tab the lead sits in", () => {
    expect(demoLeadStage(booking({ demoStatus: "REQUESTED", status: "pending" }), {}, now)).toBe("Requested");
    expect(demoLeadStage(booking({ demoStatus: "REQUESTED", needsNewTime: true }), {}, now)).toBe("Requested - needs a new time");
    expect(demoLeadStage(booking({ demoStatus: "CLASSROOM_CREATED", startAt: new Date("2026-10-07T09:00:00Z") }), {}, now)).toBe("Booked / Upcoming");
    expect(demoLeadStage(booking({ demoStatus: "CLASSROOM_CREATED", startAt: new Date("2026-10-05T09:00:00Z") }), {}, now)).toBe("Booked - demo time passed, outcome not marked");
    expect(demoLeadStage(booking({ demoStatus: "ASSESSMENT_PENDING", status: "confirmed" }), {}, now)).toBe("Completed - assessment pending");
    expect(demoLeadStage(booking({ demoStatus: "COMPLETED", status: "confirmed" }), {}, now)).toBe("Completed");
    expect(demoLeadStage(booking({ demoStatus: "STUDENT_NO_SHOW", status: "confirmed" }), {}, now)).toBe("No Show / Missed");
    expect(demoLeadStage(booking({ demoStatus: "ON_HOLD" }), {}, now)).toBe("Demo Closed");
    expect(demoLeadStage(booking({ demoStatus: "CONVERTED" }), {}, now)).toBe("Converted");
    expect(demoLeadStage(booking({ demoStatus: "CONVERTED", archivedAt: new Date() }), {}, now)).toBe("History (archived)");
  });

  it("names leads that never booked a demo", () => {
    expect(demoLeadStage({}, { _id: "s", accountStatus: "demo" }, now)).toBe("Demo account - no demo booked");
    expect(demoLeadStage({}, { _id: "s", accountStatus: "active", conversionSetup: { convertedAt: new Date() } }, now)).toBe("Converted (no demo booking)");
    expect(demoLeadStage({}, {}, now)).toBe("Demo deleted");
  });
});

describe("demoLeadReportSheets", () => {
  it("adds each lead's stage, CRM stage and journey, and lists every step on a second sheet", async () => {
    const studentId = "64a0000000000000000000a1";
    const bookingId = "64a0000000000000000000b1";
    (Booking.find as any).mockReturnValue(chain([
      {
        _id: bookingId,
        student: { _id: studentId, name: "Riya", accountStatus: "demo" },
        startAt: new Date("2026-10-01T10:30:00Z"),
        status: "confirmed",
        demoStatus: "COMPLETED",
        createdAt: new Date("2026-09-28T05:00:00Z"),
      },
    ]));
    (DemoFeedback.find as any).mockReturnValue(chain([
      { booking: bookingId, demoUser: { _id: studentId, name: "Riya" }, coach: { name: "Coach A" }, status: "submitted", strengths: "Tactics" },
      { booking: null, demoUser: null, studentName: "Old Lead", coachName: "Coach B", status: "draft" },
    ]));
    (User.find as any).mockReturnValue(chain([
      { _id: studentId, name: "Riya", accountStatus: "demo" },
      { _id: "64a0000000000000000000a2", name: "CRM Only", accountStatus: "demo" },
    ]));
    (Activity.find as any).mockReturnValue(chain([
      { type: "demo.booking.requested", label: "Requested a demo class", entityType: "Booking", entityId: bookingId, occurredAt: new Date("2026-09-28T05:00:00Z") },
      { type: "demo.booking.approved", label: "Approved demo and created classroom", entityType: "Booking", entityId: bookingId, actor: { name: "Saptarshi" }, occurredAt: new Date("2026-09-29T05:00:00Z") },
    ]));
    (CrmLeadRecord.find as any).mockReturnValue(chain([
      {
        portalUser: studentId,
        stage: "Demo Done",
        stageChangedAt: new Date("2026-10-02T05:00:00Z"),
        stageHistory: [
          { stage: "Demo Booked", at: new Date("2026-09-29T05:00:00Z"), source: "portal" },
          { stage: "Demo Done", at: new Date("2026-10-02T05:00:00Z"), source: "kraya", actorName: "Sayandeb" },
        ],
      },
    ]));

    const sheets = await demoLeadReportSheets(new Date("2026-10-06T09:00:00Z").getTime());
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Demo leads", "Assessments", "Demo journey"]);
    const [leads, assessments, journey] = sheets;
    const col = (label: string) => leads.columns.findIndex((column) => column.label === label);
    // Riya, the assessment whose booking was deleted, and the CRM-only account.
    expect(leads.rows.map((row) => row[col("Student")])).toEqual(["Riya", "Old Lead", "CRM Only"]);
    leads.rows.forEach((row) => expect(row).toHaveLength(leads.columns.length));
    expect(leads.rows[0][col("Current stage")]).toBe("Completed");
    expect(leads.rows[0][col("CRM stage")]).toBe("Demo Done");
    expect(leads.rows[0][col("Strengths")]).toBe("Tactics");
    expect(String(leads.rows[0][col("Journey")]).split("\n")).toHaveLength(3);
    expect(leads.rows[2][col("Current stage")]).toBe("Demo account - no demo booked");
    expect(leads.rows[2][col("Assessment status")]).toBe("Not assessed");

    // Every assessment, and only assessments.
    const acol = (label: string) => assessments.columns.findIndex((column) => column.label === label);
    expect(assessments.rows.map((row) => row[acol("Student")])).toEqual(["Riya", "Old Lead"]);
    assessments.rows.forEach((row) => expect(row).toHaveLength(assessments.columns.length));
    expect(assessments.rows[0][acol("Coach")]).toBe("Coach A");
    expect(assessments.rows[0][acol("Current stage")]).toBe("Completed");
    expect(assessments.rows[1][acol("Assessment status")]).toBe("Draft");

    const step = journey.columns.findIndex((column) => column.label === "Step");
    // The portal's own CRM push is not listed twice; the Kraya-side move is.
    expect(journey.rows.map((row) => row[step])).toEqual([
      "Requested a demo class",
      "Approved demo and created classroom",
      "CRM stage moved to Demo Done",
    ]);
    expect(buildSpreadsheet("xlsx", sheets).subarray(0, 2).toString()).toBe("PK");
  });
});

describe("demoLeadStage with a CRM stage", () => {
  it("names a demo account Kraya closed, matching its place under Demo Closed", () => {
    const account = { _id: "s", accountStatus: "demo" };
    expect(demoLeadStage({}, account, Date.now(), "Dead")).toBe("Demo account - closed in CRM");
    expect(demoLeadStage({}, account, Date.now(), "No Response")).toBe("Demo account - closed in CRM");
    expect(demoLeadStage({}, account, Date.now(), "Fresh Lead")).toBe("Demo account - no demo booked");
    // A booked demo's stage is the Demo Center's own, whatever the CRM says.
    expect(demoLeadStage({ _id: "b", demoStatus: "REQUESTED" }, account, Date.now(), "Dead")).toBe("Requested");
  });
});
