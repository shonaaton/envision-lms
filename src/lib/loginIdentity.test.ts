import { describe, expect, it } from "vitest";
import { escapeRegex, loginIdentifierFilter } from "@/lib/loginIdentity";

function usernamePattern(loginValue: string) {
  const clause = loginIdentifierFilter(loginValue).$or.find((entry: any) => entry.username) as any;
  return clause?.username as RegExp | undefined;
}

describe("loginIdentifierFilter", () => {
  it("lowercases the email clause so email sign-in ignores case", () => {
    expect(loginIdentifierFilter("  Asha.Roy@Example.COM ").$or[0]).toEqual({ email: "asha.roy@example.com" });
  });

  it("matches a generated user ID whatever case it is typed in", () => {
    const pattern = usernamePattern("rahul@env");
    expect(pattern?.test("Rahul@ENV")).toBe(true);
    expect(usernamePattern("RAHUL@ENV")?.test("Rahul@ENV")).toBe(true);
    expect(usernamePattern("Rahul@ENV")?.test("Rahul@ENV")).toBe(true);
  });

  it("stays an exact match rather than a prefix match", () => {
    const pattern = usernamePattern("Rahul@ENV");
    expect(pattern?.test("Rahul@ENV2")).toBe(false);
    expect(pattern?.test("XRahul@ENV")).toBe(false);
  });

  it("does not let a crafted value become a wildcard", () => {
    const pattern = usernamePattern(".*");
    expect(pattern?.test("Rahul@ENV")).toBe(false);
    expect(pattern?.test(".*")).toBe(true);
  });

  it("keeps the numeric suffix form distinct", () => {
    expect(usernamePattern("rahul2@env")?.test("Rahul2@ENV")).toBe(true);
    expect(usernamePattern("rahul2@env")?.test("Rahul@ENV")).toBe(false);
  });

  it("omits the username clause when nothing was typed", () => {
    expect(loginIdentifierFilter("   ").$or).toHaveLength(1);
  });
});

describe("escapeRegex", () => {
  it("escapes every metacharacter that could widen a match", () => {
    expect(new RegExp(`^${escapeRegex("a+b.c*d")}$`).test("a+b.c*d")).toBe(true);
    expect(new RegExp(`^${escapeRegex("a+b.c*d")}$`).test("aaabXcccd")).toBe(false);
  });
});
