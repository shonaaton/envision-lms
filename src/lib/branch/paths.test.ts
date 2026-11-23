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

  it("opens only the live room API of a classroom, for the branch's online classes", () => {
    const room = "/api/classrooms/507f1f77bcf86cd799439011/live";
    for (const role of ["student", "instructor"]) {
      for (const path of [room, `${room}/move`, `${room}/chat`, `${room}/question`, `${room}/responses`, "/api/time"]) {
        expect(isBranchAllowedPath(path, role)).toBe(true);
      }
      for (const path of ["/api/classrooms", "/api/classrooms/507f1f77bcf86cd799439011", "/classrooms", "/classrooms/507f1f77bcf86cd799439011/live", `${room}/move/x`, "/api/attendance"]) {
        expect(isBranchAllowedPath(path, role)).toBe(false);
      }
    }
  });

  it("sends each kind of account home", () => {
    expect(branchHomePath("student")).toBe("/bowbazar/me");
    expect(branchHomePath("instructor")).toBe("/bowbazar");
  });
});
