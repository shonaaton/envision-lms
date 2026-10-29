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
    expect(isBranchAllowedPath("/bowbazar/me/change", "student")).toBe(true);
    expect(isBranchAllowedPath("/api/bowbazar/me/changes", "student")).toBe(true);
    expect(isBranchAllowedPath("/api/bowbazar/meet", "student")).toBe(false);
    expect(isBranchAllowedPath("/bowbazar/fees", "instructor")).toBe(true);
    expect(isBranchAllowedPath("/api/bowbazar/students", "instructor")).toBe(true);
  });

  it("opens the teaching tools to branch staff only", () => {
    for (const path of ["/pgn", "/pgn/abc", "/api/pgn/folders", "/analysis"]) {
      expect(isBranchAllowedPath(path, "instructor")).toBe(true);
      expect(isBranchAllowedPath(path, "student")).toBe(false);
    }
    expect(isBranchAllowedPath("/pgnx", "instructor")).toBe(false);
  });

  it("opens the chess practice tools to branch students", () => {
    for (const path of ["/tactics-trainer", "/king-hunt", "/square-trainer", "/learn", "/learn/basics/1", "/chess-profile", "/api/chess/profile", "/api/learn/attempt", "/play/king-hunt"]) {
      expect(isBranchAllowedPath(path, "student")).toBe(true);
    }
    expect(isBranchAllowedPath("/learnx", "student")).toBe(false);
    expect(isBranchAllowedPath("/admin/learn", "student")).toBe(false);
  });

  it("sends each kind of account home", () => {
    expect(branchHomePath("student")).toBe("/bowbazar/me");
    expect(branchHomePath("instructor")).toBe("/bowbazar");
  });
});
