import { describe, expect, it } from "vitest";
import { scopeStudentFilter, scopeStudentPipeline } from "@/lib/branch/scope";

describe("scopeStudentFilter", () => {
  it("narrows a plain student query to online accounts", () => {
    expect(scopeStudentFilter({ role: "student", isActive: true })).toEqual({ role: "student", isActive: true, branch: null });
  });

  it("narrows coach queries the same way", () => {
    expect(scopeStudentFilter({ role: "instructor" })).toEqual({ role: "instructor", branch: null });
  });

  it("drops only branch accounts from a mixed role list", () => {
    expect(scopeStudentFilter({ role: { $in: ["student", "admin"] } })).toEqual({
      role: { $in: ["student", "admin"] },
      $and: [{ $or: [{ role: { $nin: ["student", "instructor"] } }, { branch: null }] }],
    });
  });

  it("keeps an existing $and when it adds its own clause", () => {
    const scoped = scopeStudentFilter({ role: { $eq: "student" }, $and: [{ isActive: true }] });
    expect(scoped?.$and).toEqual([{ isActive: true }, { $or: [{ role: { $nin: ["student", "instructor"] } }, { branch: null }] }]);
  });

  it("finds a student role buried in $or", () => {
    expect(scopeStudentFilter({ $or: [{ role: "student" }, { role: "admin" }] })).not.toBeNull();
  });

  it("leaves branch queries alone", () => {
    expect(scopeStudentFilter({ role: "student", branch: "bowbazar" })).toBeNull();
    expect(scopeStudentFilter({ $and: [{ role: "student" }, { branch: { $in: ["bowbazar"] } }] })).toBeNull();
  });

  it("leaves lookups of known accounts alone", () => {
    expect(scopeStudentFilter({ _id: "abc", role: "student" })).toBeNull();
    expect(scopeStudentFilter({ _id: { $in: ["a", "b"] }, role: { $in: ["student", "admin"] } })).toBeNull();
  });

  it("still scopes \"everyone except\" queries", () => {
    expect(scopeStudentFilter({ _id: { $ne: "abc" }, role: "student" })).toEqual({ _id: { $ne: "abc" }, role: "student", branch: null });
  });

  it("leaves queries that are not about students alone", () => {
    expect(scopeStudentFilter({ email: "parent@example.com" })).toBeNull();
    expect(scopeStudentFilter({ role: "sub-admin" })).toBeNull();
    expect(scopeStudentFilter({ role: { $ne: "student" } })).toBeNull();
    expect(scopeStudentFilter({})).toBeNull();
  });
});

describe("scopeStudentPipeline", () => {
  it("scopes a leading $match", () => {
    expect(scopeStudentPipeline([{ $match: { role: "student" } }, { $count: "n" }])).toEqual([
      { $match: { role: "student", branch: null } },
      { $count: "n" },
    ]);
  });

  it("ignores pipelines that do not start by matching students", () => {
    expect(scopeStudentPipeline([{ $group: { _id: "$role" } }])).toBeNull();
    expect(scopeStudentPipeline([{ $match: { role: "admin" } }])).toBeNull();
  });
});
