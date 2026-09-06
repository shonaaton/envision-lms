import { describe, expect, it } from "vitest";
import { addUserSchema, registerSchema } from "@/lib/validation";

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
