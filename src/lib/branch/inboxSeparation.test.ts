import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/Branch", () => ({ BranchStudent: {} }));
vi.mock("@/models/User", () => ({ User: {} }));
import { branchOnlyNationals, inboxNational } from "./inboxSeparation";

describe("Bowbazar chats stay out of the online inbox", () => {
  it("hides a number only a Bowbazar student record holds, in any spelling", () => {
    const hidden = branchOnlyNationals(["+91 98765 43210", "09123456789"], []);
    expect(hidden).toEqual(new Set(["9876543210", "9123456789"]));
    expect(hidden.has(inboxNational("919876543210"))).toBe(true);
    expect(hidden.has(inboxNational("9123456789"))).toBe(true);
  });
  it("keeps a family visible online when an online account shares the number", () => {
    expect(branchOnlyNationals(["9876543210"], ["+919876543210"]).size).toBe(0);
  });
  it("never hides a number it can't read as an Indian mobile", () => {
    expect(branchOnlyNationals(["", "12345", null], []).size).toBe(0);
    expect(inboxNational("447911123456")).toBe("");
  });
});
