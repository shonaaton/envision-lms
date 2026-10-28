import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { deleteUserRecords } from "@/lib/deleteUserRecords";
import { withOpenTempPassword } from "@/lib/tempPasswords";
import { Homework } from "@/models/Homework";
import { User } from "@/models/User";
import { BranchAdmission, BranchAttendance, BranchFeeBill, BranchSlot, BranchStudent } from "@/models/Branch";
import type { BranchKey } from "./scope";
import { BranchError, setStaffActive, setStudentStatus } from "./service";
import { slotLabel } from "./rules";

/**
 * The branch's own user management - the online Users page, for one branch's
 * accounts only: its students and its staff. Run by the branch admin; online
 * admins have no access to a branch (lib/branch/rules.ts).
 */

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);
// Siblings without an address of their own sign in with a reserved placeholder.
const realEmail = (email: unknown) => (/\.invalid$/i.test(String(email || "")) ? "" : String(email || ""));

type Actor = { id: string; name?: string };
export type BranchUserKind = "students" | "staff";

function newPassword() {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "x");
}

export async function listBranchUsers(branch: BranchKey, kind: BranchUserKind) {
  await dbConnect();
  const users: any[] = await User.find({ branch, role: kind === "students" ? "student" : "instructor" })
    .select("name username email phone countryCode role branchRole isActive tempPassword passwordChangedAt passwordChangeSource lastLoginAt createdAt avatar loginLockedUntil")
    .sort({ name: 1 })
    .lean();
  const students: any[] = kind === "students" ? await BranchStudent.find({ branch }).select("user regNo status slots parentName").lean() : [];
  const slots: any[] = kind === "students" ? await BranchSlot.find({ branch }).lean() : [];
  const studentByUser = new Map(students.map((student) => [id(student.user), student]));
  const slotById = new Map(slots.map((slot) => [id(slot), slot]));

  return users.map((raw) => {
    const user = withOpenTempPassword(raw);
    const student = studentByUser.get(id(user));
    return {
      id: id(user),
      name: user.name as string,
      username: user.username || "",
      email: realEmail(user.email),
      phone: user.phone || "",
      kind,
      branchRole: kind === "staff" ? user.branchRole || "coach" : "",
      isActive: user.isActive !== false,
      tempPassword: user.tempPassword || "",
      passwordChangedAt: user.passwordChangedAt || null,
      passwordChangeSource: user.passwordChangeSource || "",
      lockedUntil: user.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now() ? user.loginLockedUntil : null,
      lastLoginAt: user.lastLoginAt || null,
      createdAt: user.createdAt || null,
      avatar: user.avatar || "",
      studentId: student ? id(student) : "",
      regNo: student?.regNo || "",
      parentName: student?.parentName || "",
      slots: (student?.slots || []).map((slot: any) => slotById.get(id(slot))).filter(Boolean).map(slotLabel),
    };
  });
}

async function findBranchUser(branch: BranchKey, userId: string) {
  if (!isObjectId(userId)) throw new BranchError("User not found.", 404);
  const user: any = await User.findOne({ _id: userId, branch, role: { $in: ["student", "instructor"] } })
    .select("name email phone role branchRole isActive")
    .lean();
  if (!user) throw new BranchError("User not found.", 404);
  return user;
}

/** Name, email and phone for anyone; manager/coach for staff. The admin's own role never changes here. */
export async function updateBranchUser(branch: BranchKey, userId: string, input: any, actor: Actor) {
  await dbConnect();
  const user = await findBranchUser(branch, userId);
  const name = text(input?.name, 120);
  if (!name) throw new BranchError("Enter a name.");
  const phone = text(input?.phone, 20).replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
  if (phone && phone.length < 10) throw new BranchError("Enter a 10-digit phone number.");
  const email = text(input?.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BranchError("Enter a valid email address.");
  if (!email && user.role !== "student") throw new BranchError("Staff need an email address.");

  const set: Record<string, unknown> = { name, phone };
  // A student left without an email keeps their placeholder; a new one must be free.
  if (email && email !== user.email) {
    if (await User.exists({ email, _id: { $ne: user._id } }).setOptions({ allBranches: true })) {
      throw new BranchError("That email already belongs to another account.", 409);
    }
    set.email = email;
  }
  if (user.role === "instructor" && user.branchRole !== "admin" && ["manager", "coach"].includes(input?.branchRole)) {
    set.branchRole = input.branchRole;
  }
  await User.updateOne({ _id: user._id }, { $set: set });
  if (user.role === "student") {
    await BranchStudent.updateOne({ user: user._id, branch }, { $set: { name, phone, ...(email ? { email } : {}) } });
  }
  void recordActivity({
    actor: actor.id,
    targetUser: id(user),
    type: "branch.user_updated",
    label: `Updated ${branch} account ${name}`,
    entityType: "User",
    entityId: id(user),
  });
}

/** A new temporary password, shown once. Also clears a sign-in lockout. */
export async function resetBranchUserPassword(branch: BranchKey, userId: string, actor: Actor) {
  await dbConnect();
  if (userId === actor.id) throw new BranchError("Change your own password in Account Settings.");
  const user = await findBranchUser(branch, userId);
  const password = newPassword();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await bcrypt.hash(password, 10),
        tempPassword: password,
        passwordChangedAt: new Date(),
        passwordChangeSource: "admin_reset",
        failedLoginAttempts: 0,
      },
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, lastFailedLoginAt: 1, loginLockedUntil: 1 },
    }
  );
  const updated: any = await User.findById(user._id).select("username").lean();
  void recordActivity({
    actor: actor.id,
    targetUser: id(user),
    type: "user.password_reset",
    label: `Reset password for ${user.name} (${branch})`,
    entityType: "User",
    entityId: id(user),
  });
  return { username: updated?.username as string, password };
}

/**
 * Turns an account off or back on. A student goes through the same path as
 * the Students page (a reason to leave, a free seat to come back); staff are
 * switched directly. The branch admin can't switch off their own account.
 */
export async function setBranchUserActive(branch: BranchKey, userId: string, input: any, actor: Actor) {
  await dbConnect();
  const user = await findBranchUser(branch, userId);
  const active = Boolean(input?.active);
  if (user.role === "student") {
    const student: any = await BranchStudent.findOne({ user: user._id, branch }).select("_id").lean();
    if (!student) throw new BranchError("This student has no branch record.", 404);
    await setStudentStatus(branch, id(student), { status: active ? "active" : "inactive", reason: input?.reason, since: input?.since }, actor.id);
    return;
  }
  if (user.branchRole === "admin") throw new BranchError("The branch admin's account can't be switched off here.");
  await setStaffActive(branch, id(user), active);
}

/**
 * Deletes an account and everything tied to it, like the online Users page.
 * The full name must be typed to confirm. A student's fee bills and branch
 * record go with them, and they are taken off past registers; homework a
 * staff member set stays with the branch, handed to whoever deletes them.
 */
export async function deleteBranchUser(branch: BranchKey, userId: string, input: any, actor: Actor) {
  await dbConnect();
  if (userId === actor.id) throw new BranchError("You can't delete your own account.", 409);
  const user = await findBranchUser(branch, userId);
  if (user.branchRole === "admin") throw new BranchError("The branch admin's account can't be deleted here.", 409);
  if (text(input?.confirmName, 200) !== user.name) throw new BranchError("Type the full name exactly to confirm.");

  if (user.role === "student") {
    const student: any = await BranchStudent.findOne({ user: user._id, branch }).select("_id").lean();
    if (student) {
      await Promise.all([
        BranchFeeBill.deleteMany({ student: student._id }),
        BranchAttendance.updateMany({ "records.student": student._id }, { $pull: { records: { student: student._id } } }),
        BranchAdmission.updateMany({ student: student._id }, { $unset: { student: 1 } }),
        BranchStudent.deleteOne({ _id: student._id }),
      ]);
    }
    await Homework.updateMany({ branch, assignedStudents: user._id }, { $pull: { assignedStudents: user._id } });
  } else {
    await Homework.updateMany({ branch, instructor: user._id }, { $set: { instructor: new Types.ObjectId(actor.id) } });
  }
  await deleteUserRecords(id(user));
  void recordActivity({
    actor: actor.id,
    type: "branch.user_deleted",
    label: `Permanently deleted ${branch} ${user.role === "student" ? "student" : "staff"} account ${user.name}`,
    entityType: "User",
    entityId: id(user),
  });
}
