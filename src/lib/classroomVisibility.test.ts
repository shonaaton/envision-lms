import { describe, expect, it } from "vitest";
import { visibleClassroomFilter } from "@/lib/classroomVisibility";

const OWNER = "507f1f77bcf86cd799439011";
const SOMEONE_ELSE = "507f1f77bcf86cd799439012";

describe("visibleClassroomFilter", () => {
  it("hides sandbox classrooms from students", () => {
    expect(visibleClassroomFilter({ role: "student", userId: OWNER })).toEqual({
      isTestClassroom: { $ne: true },
    });
  });

  it("hides sandbox classrooms from coaches", () => {
    // A coach is never a super admin, so the live room would refuse a sandbox
    // classroom outright - listing one only produces a dead Join button.
    expect(visibleClassroomFilter({ role: "instructor", userId: OWNER, isSuperAdmin: true })).toEqual({
      isTestClassroom: { $ne: true },
    });
  });

  it("hides sandbox classrooms from admins who are not super admins", () => {
    expect(visibleClassroomFilter({ role: "admin", userId: OWNER, isSuperAdmin: false })).toEqual({
      isTestClassroom: { $ne: true },
    });
  });

  it("hides sandbox classrooms from sub-admins", () => {
    expect(visibleClassroomFilter({ role: "sub-admin", userId: OWNER, isSuperAdmin: true })).toEqual({
      isTestClassroom: { $ne: true },
    });
  });

  it("keeps a super admin's own sandbox visible to them", () => {
    expect(visibleClassroomFilter({ role: "admin", userId: OWNER, isSuperAdmin: true })).toEqual({
      $or: [{ isTestClassroom: { $ne: true } }, { isTestClassroom: true, testOwner: OWNER }],
    });
  });

  it("scopes the sandbox exemption to the owner, not to super admins generally", () => {
    const filter: any = visibleClassroomFilter({ role: "admin", userId: SOMEONE_ELSE, isSuperAdmin: true });
    expect(filter.$or[1]).toEqual({ isTestClassroom: true, testOwner: SOMEONE_ELSE });
  });

  it("treats a missing role as untrusted", () => {
    expect(visibleClassroomFilter({ role: undefined, userId: OWNER, isSuperAdmin: true })).toEqual({
      isTestClassroom: { $ne: true },
    });
  });

  it("only ever emits $or for the super-admin case, so it cannot clobber coachClassroomQuery's", () => {
    for (const role of ["student", "instructor", "sub-admin"]) {
      expect(visibleClassroomFilter({ role, userId: OWNER, isSuperAdmin: true })).not.toHaveProperty("$or");
    }
  });
});
