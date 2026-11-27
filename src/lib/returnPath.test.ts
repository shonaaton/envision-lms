import { describe, expect, it } from "vitest";
import { loginPathFor, safeReturnPath } from "./returnPath";

describe("safeReturnPath", () => {
  it("keeps a page on this site", () => {
    expect(safeReturnPath("/exams/6b04207449f6ebac46dbd033")).toBe("/exams/6b04207449f6ebac46dbd033");
    expect(safeReturnPath("/homework?tab=due")).toBe("/homework?tab=due");
  });

  it("refuses other hosts and odd values", () => {
    for (const value of ["//evil.test/x", "/\\evil.test", "https://evil.test", "evil.test", "", "/exams\n/x", undefined, null, 42]) {
      expect(safeReturnPath(value)).toBe("/dashboard");
    }
  });

  it("never sends back to a sign-in screen or the API", () => {
    for (const value of ["/login", "/login?callbackUrl=/x", "/register", "/api/auth/signout", "/reset-password/abc"]) {
      expect(safeReturnPath(value)).toBe("/dashboard");
    }
  });
});

describe("loginPathFor", () => {
  it("carries the page through login", () => {
    expect(loginPathFor("/exams/abc")).toBe("/login?callbackUrl=%2Fexams%2Fabc");
  });

  it("is plain /login when there is nothing to come back to", () => {
    expect(loginPathFor("/dashboard")).toBe("/login");
    expect(loginPathFor("")).toBe("/login");
    expect(loginPathFor(null)).toBe("/login");
  });
});
