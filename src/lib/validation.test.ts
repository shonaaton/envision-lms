import { describe, expect, it } from "vitest";
import { addUserSchema, batchUpdateSchema, registerSchema } from "@/lib/validation";

const baseRegistration = {
  name: "Asha Roy",
  email: "asha@example.com",
  password: "secretpassword",
  role: "student" as const,
  countryCode: "+91",
  phone: "9123456789",
};

describe("registerSchema phone", () => {
  it("accepts a normal signup", () => {
    expect(registerSchema.parse(baseRegistration).phone).toBe("9123456789");
  });

  it("rejects a signup with no phone, so no lead can bypass the CRM", () => {
    expect(() => registerSchema.parse({ ...baseRegistration, phone: "" })).toThrow();
    const { phone, ...withoutPhone } = baseRegistration;
    expect(() => registerSchema.parse(withoutPhone)).toThrow();
  });

  it("rejects whitespace posing as a phone number", () => {
    expect(() => registerSchema.parse({ ...baseRegistration, phone: "   " })).toThrow();
  });

  it("still accepts short international numbers", () => {
    expect(registerSchema.parse({ ...baseRegistration, countryCode: "+352", phone: "621123" }).phone).toBe("621123");
  });

  it("rejects a number that cannot belong to the dialling code beside it", () => {
    // How a demo lead came to be stored as a 13-digit Indian mobile, which then
    // failed every WhatsApp send it was used for.
    expect(() => registerSchema.parse({ ...baseRegistration, phone: "9162903499998" })).toThrow();
    expect(() => registerSchema.parse({ ...baseRegistration, phone: "91234" })).toThrow();
  });

  it("accepts an Indian number typed with or without its country code", () => {
    expect(registerSchema.parse({ ...baseRegistration, phone: "919123456789" }).phone).toBe("919123456789");
    expect(registerSchema.parse({ ...baseRegistration, phone: "+91 91234 56789" }).phone).toBe("+91 91234 56789");
  });

  it("applies to coach applications too, matching the shared signup form", () => {
    expect(() => registerSchema.parse({ ...baseRegistration, role: "instructor", phone: "" })).toThrow();
  });
});

describe("addUserSchema phone", () => {
  it("stays optional, because admin-created users are not demo leads", () => {
    const parsed = addUserSchema.parse({ name: "Coach Ray", email: "ray@example.com", role: "instructor" });
    expect(parsed.phone).toBeUndefined();
  });
});

describe("batchUpdateSchema", () => {
  const objectId = "5f1d7f2e4b3a2c1d0e9f8a7b";

  it("accepts the fields the edit form actually sends", () => {
    const parsed = batchUpdateSchema.parse({
      name: "Tuesday 5PM Group",
      description: "Group of eight",
      level: "intermediate",
      capacity: 8,
      coach: objectId,
      students: [objectId],
    });
    expect(parsed.level).toBe("intermediate");
    expect(parsed.coach).toBe(objectId);
  });

  it("allows a partial edit, so changing only the level leaves the roster alone", () => {
    expect(batchUpdateSchema.parse({ level: "semi_pro" })).toEqual({ level: "semi_pro" });
  });

  it("keeps \"\" for coach, which is how the form unassigns one", () => {
    expect(batchUpdateSchema.parse({ coach: "" }).coach).toBe("");
  });

  it("rejects the pause and closure trail, which only the pause flow may write", () => {
    expect(() => batchUpdateSchema.parse({ isPaused: true })).toThrow();
    expect(() => batchUpdateSchema.parse({ pausedUntil: "2026-01-01" })).toThrow();
    expect(() => batchUpdateSchema.parse({ isActive: false })).toThrow();
    expect(() => batchUpdateSchema.parse({ closedAt: "2026-01-01" })).toThrow();
    expect(() => batchUpdateSchema.parse({ studentEnrollments: [] })).toThrow();
  });

  it("rejects ids that are not object ids, so no query operator reaches mongoose", () => {
    expect(() => batchUpdateSchema.parse({ coach: "not-an-id" })).toThrow();
    expect(() => batchUpdateSchema.parse({ students: ["not-an-id"] })).toThrow();
  });

  it("rejects a level outside the course ladder", () => {
    expect(() => batchUpdateSchema.parse({ level: "grandmaster" })).toThrow();
  });

  it("holds capacity to a sane range", () => {
    expect(() => batchUpdateSchema.parse({ capacity: 0 })).toThrow();
    expect(() => batchUpdateSchema.parse({ capacity: 101 })).toThrow();
  });
});
