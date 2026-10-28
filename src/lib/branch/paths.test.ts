import { describe, expect, it } from "vitest";
import { branchHomePath, isBranchAllowedPath } from "@/lib/branch/paths";

describe("isBranchAllowedPath", () => {
  it("opens the shared features to every branch account", () => {
    for (const path of ["/tournaments", "/tournaments/abc/games/1", "/api/tournaments/abc/join", "/homework/x", "/profile", "/api/branding"]) {
      expect(isBranchAllowedPath(path, "student")).toBe(true);
      expect(isBranchAllowedPath(path, "instructor")).toBe(true);
    }
  });

  it("closes the online academy", () => {
    for (const path of ["/dashboard", "/classrooms", "/admin/users", "/fees", "/api/classrooms", "/coach-pay", "/tournamentsx"]) {
      expect(isBranchAllowedPath(path, "instructor")).toBe(false);
    }
  });

  it("gives students their own page and keeps them off the staff screens", () => {
    expect(isBranchAllowedPath("/bowbazar/me", "student")).toBe(true);
    expect(isBranchAllowedPath("/bowbazar", "student")).toBe(false);
    expect(isBranchAllowedPath("/bowbazar/fees", "student")).toBe(false);
    expect(isBranchAllowedPath("/api/bowbazar/students", "student")).toBe(false);
    expect(isBranchAllowedPath("/bowbazar/fees", "instructor")).toBe(true);
    expect(isBranchAllowedPath("/api/bowbazar/students", "instructor")).toBe(true);
  });

  it("sends each kind of account home", () => {
    expect(branchHomePath("student")).toBe("/bowbazar/me");
    expect(branchHomePath("instructor")).toBe("/bowbazar");
  });
});
