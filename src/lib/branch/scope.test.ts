import { describe, expect, it } from "vitest";
import { scopeBranchRecordFilter, scopeBranchRecordPipeline, scopeStudentFilter, scopeStudentPipeline } from "@/lib/branch/scope";

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

describe("scopeBranchRecordFilter (classrooms)", () => {
  it("keeps every online classroom query to online classrooms", () => {
    expect(scopeBranchRecordFilter({ coach: "c1", isActive: true })).toEqual({ coach: "c1", isActive: true, branch: null });
    expect(scopeBranchRecordFilter({})).toEqual({ branch: null });
    expect(scopeBranchRecordFilter(undefined)).toEqual({ branch: null });
    expect(scopeBranchRecordFilter({ $or: [{ coach: "c1" }, { instructor: "c1" }] })).toEqual({ $or: [{ coach: "c1" }, { instructor: "c1" }], branch: null });
  });

  it("leaves branch queries and lookups by id alone", () => {
    expect(scopeBranchRecordFilter({ branch: "bowbazar", branchSlot: "s1" })).toBeNull();
    expect(scopeBranchRecordFilter({ _id: "507f1f77bcf86cd799439011" })).toBeNull();
    expect(scopeBranchRecordFilter({ _id: { $in: ["a", "b"] } })).toBeNull();
  });

  it("still scopes an everyone-but-one query", () => {
    expect(scopeBranchRecordFilter({ _id: { $ne: "a" } })).toEqual({ _id: { $ne: "a" }, branch: null });
  });

  it("scopes aggregations, adding a match when the pipeline has none", () => {
    expect(scopeBranchRecordPipeline([{ $match: { status: "scheduled" } }, { $count: "n" }])).toEqual([{ $match: { status: "scheduled", branch: null } }, { $count: "n" }]);
    expect(scopeBranchRecordPipeline([{ $unwind: "$students" }])).toEqual([{ $match: { branch: null } }, { $unwind: "$students" }]);
    expect(scopeBranchRecordPipeline([{ $match: { branch: "bowbazar" } }])).toBeNull();
  });
});
