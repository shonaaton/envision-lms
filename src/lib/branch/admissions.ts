import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { saveUpload } from "@/lib/uploads";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { BranchAdmission, BranchSlot, BranchStudent } from "@/models/Branch";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { BranchError, createStudent } from "./service";
import { rupeesToPaise, slotLabel } from "./rules";
import {
  ADMISSION_LINK_DAYS,
  admissionMessage,
  detailsUpdateMessage,
  checkAdmissionFile,
  readAdmissionForm,
  tenDigitPhone,
  whatsAppChatLink,
  type AdmissionFileKind,
} from "./admissionRules";
import { readAdmissionFile, removeAdmissionFiles, saveAdmissionFile } from "./admissionFiles";

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const isObjectId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type Actor = { id: string; name?: string };

function newToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ADMISSION_LINK_DAYS * 86400000) };
}

function linkFor(token: string, request?: Request) {
  const base = resolvePublicAppUrl(request) || (request ? new URL(request.url).origin : "");
  return `${base}/admission/${token}`;
}

function isExpired(admission: any) {
  return admission.status === "sent" && new Date(admission.expiresAt).getTime() <= Date.now();
}

function serialize(admission: any, slotById: Map<string, any>) {
  const prefill = admission.prefill || {};
  return {
    id: id(admission),
    kind: (admission.kind || "new") as "new" | "update",
    status: isExpired(admission) ? "expired" : (admission.status as string),
    prefill: {
      name: prefill.name || "",
      parentName: prefill.parentName || "",
      phone: prefill.phone || "",
      email: prefill.email || "",
      fatherName: prefill.fatherName || "",
      motherName: prefill.motherName || "",
      school: prefill.school || "",
      dateOfBirth: prefill.dateOfBirth || "",
      slots: (prefill.slots || []).map(id),
      slotLabels: (prefill.slots || []).map((slot: any) => slotById.get(id(slot))).filter(Boolean).map(slotLabel),
      monthlyFee: prefill.monthlyFee || 0,
      note: prefill.note || "",
    },
    form: admission.form?.name ? { ...admission.form } : null,
    hasPhoto: Boolean(admission.photo?.storedName),
    hasIdDocument: Boolean(admission.idDocument?.storedName),
    idDocumentType: admission.idDocument?.mimeType || "",
    expiresAt: admission.expiresAt,
    sends: admission.sends || 1,
    lastSentAt: admission.lastSentAt || admission.createdAt,
    createdAt: admission.createdAt,
    createdByName: admission.createdByName || "",
    submittedAt: admission.submittedAt || null,
    decidedAt: admission.decidedAt || null,
    decidedByName: admission.decidedByName || "",
    rejectReason: admission.rejectReason || "",
    studentId: admission.student ? id(admission.student) : "",
  };
}

async function slotMap(branch: BranchKey) {
  const slots: any[] = await BranchSlot.find({ branch }).lean();
  return new Map(slots.map((slot) => [id(slot), slot]));
}

/**
 * Sends the form link by email (when there is an address) and WhatsApp. The
 * WhatsApp template needs Meta's approval first, so the staff screen always
 * gets the message and a wa.me link to send it by hand as well.
 */
async function deliverLink(admission: any, link: string) {
  const prefill = admission.prefill || {};
  const branchLabel = BRANCH_LABELS[admission.branch as BranchKey];
  const update = admission.kind === "update";
  const message = (update ? detailsUpdateMessage : admissionMessage)({ parentName: prefill.parentName, studentName: prefill.name, link, branchLabel });
  const metadata = { kind: "branch_admission_form", admissionId: id(admission), dedupKey: `branch-admission:${id(admission)}:${admission.sends || 1}` };
  const [email, whatsapp] = await Promise.all([
    prefill.email
      ? sendAutomationEmail({
          to: prefill.email,
          subject: update
            ? `Online portal registration: ${prefill.name} at Envision Chess Academy ${branchLabel}`
            : `Admission form: ${prefill.name} at Envision Chess Academy ${branchLabel}`,
          message,
          actionUrl: link,
          actionLabel: update ? "Update details for portal registration" : "Fill in the admission form",
          metadata,
        }).catch(() => ({ delivered: false }))
      : null,
    sendWhatsAppAutomationTemplate({
      to: `91${prefill.phone}`,
      templateName: update ? "bowbazar_portal_registration" : "bowbazar_admission_form",
      bodyParameters: [prefill.parentName || "Parent", prefill.name, link, String(ADMISSION_LINK_DAYS)],
      metadata,
    }).catch(() => ({ delivered: false })),
  ]);
  return {
    link,
    message,
    whatsappLink: whatsAppChatLink(prefill.phone, message),
    email: email ? (email.delivered ? "sent" : "failed") : "none",
    whatsapp: whatsapp.delivered ? "sent" : "failed",
  };
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export async function listAdmissions(branch: BranchKey) {
  await dbConnect();
  const [admissions, slots]: [any[], Map<string, any>] = await Promise.all([
    BranchAdmission.find({ branch }).sort({ createdAt: -1 }).limit(300).lean(),
    slotMap(branch),
  ]);
  return admissions.map((admission) => serialize(admission, slots));
}

export async function startAdmission(branch: BranchKey, input: any, actor: Actor, request?: Request) {
  await dbConnect();
  const name = text(input?.name, 120);
  if (!name) throw new BranchError("Enter the student's name.");
  const phone = tenDigitPhone(input?.phone);
  if (!phone) throw new BranchError("Enter the parent's 10-digit mobile number.");
  const email = text(input?.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BranchError("Enter a valid email address.");
  const monthlyFee = rupeesToPaise(input?.monthlyFee ?? 0);
  if (monthlyFee === null) throw new BranchError("Enter the monthly fee in rupees.");
  const slotIds = Array.isArray(input?.slots) ? ([...new Set(input.slots.map(String))] as string[]) : [];
  if (slotIds.some((slot) => !isObjectId(slot))) throw new BranchError("Choose valid slots.");
  if (slotIds.length && (await BranchSlot.countDocuments({ _id: { $in: slotIds }, branch, isActive: true })) !== slotIds.length) {
    throw new BranchError("One of the chosen slots is closed or does not exist.");
  }

  const { token, tokenHash, expiresAt } = newToken();
  const admission: any = await BranchAdmission.create({
    branch,
    tokenHash,
    expiresAt,
    prefill: { name, parentName: text(input?.parentName, 120), phone, email, slots: slotIds, monthlyFee, note: text(input?.note, 500) },
    lastSentAt: new Date(),
    createdBy: actor.id,
    createdByName: actor.name || "",
  });
  const delivery = await deliverLink(admission.toObject(), linkFor(token, request));
  void recordActivity({
    actor: actor.id,
    type: "branch.admission_sent",
    label: `Sent the ${branch} admission form for ${name}`,
    entityType: "BranchAdmission",
    entityId: id(admission),
  });
  return { admission: serialize(admission.toObject(), await slotMap(branch)), delivery };
}

/** A real address the family reads, not the `.invalid` placeholder siblings' logins get. */
const realEmail = (value: unknown) => {
  const email = text(value, 200).toLowerCase();
  return email && !email.endsWith(".invalid") ? email : "";
};
const dateText = (value: unknown) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : "");

export type DetailsSendResult = { studentId: string; name: string; status: "sent" | "skipped"; reason?: string; whatsapp?: string; email?: string };

/**
 * Sends the details form to students who are already at the centre (the
 * imported ones, mostly). It is the admission form, filled in with what the
 * centre already has; approving it completes that student's record and makes
 * no new account. A form still open is sent again with a fresh link (the old
 * link stops working). A form already filled in, or a student with no usable
 * phone number, is skipped and the reason given.
 */
export async function sendDetailsForms(branch: BranchKey, studentIds: string[], actor: Actor, request?: Request) {
  await dbConnect();
  const ids = [...new Set((studentIds || []).map(String))].filter(isObjectId);
  if (!ids.length) throw new BranchError("Choose at least one student.");
  if (ids.length > 200) throw new BranchError("Send to at most 200 students at a time.");
  const [students, open]: [any[], any[]] = await Promise.all([
    BranchStudent.find({ _id: { $in: ids }, branch }).lean(),
    BranchAdmission.find({ branch, kind: "update", student: { $in: ids }, status: { $in: ["sent", "submitted"] } }).select("student status expiresAt").lean(),
  ]);
  const users: any[] = await User.find({ _id: { $in: students.map((student) => student.user) } }).select("email parentEmail").setOptions({ allBranches: true }).lean();
  const userById = new Map(users.map((user) => [id(user), user]));
  const openFor = new Map(open.filter((admission) => !isExpired(admission)).map((admission) => [id(admission.student), admission]));

  const results: DetailsSendResult[] = [];
  for (const student of students.sort((a, b) => a.name.localeCompare(b.name))) {
    const base = { studentId: id(student), name: student.name as string };
    const existing = openFor.get(id(student));
    if (existing?.status === "submitted") {
      results.push({ ...base, status: "skipped", reason: "Already filled in; waiting for your review" });
      continue;
    }
    if (existing) {
      // Still open (an earlier send may never have arrived): send it again with a fresh link.
      const again = await refreshAndDeliver(existing._id, request).catch(() => null);
      if (again) results.push({ ...base, status: "sent", whatsapp: again.delivery.whatsapp, email: again.delivery.email });
      else results.push({ ...base, status: "skipped", reason: "The open form changed while sending; try again" });
      continue;
    }
    const phone = tenDigitPhone(student.phone);
    if (!phone) {
      results.push({ ...base, status: "skipped", reason: "No 10-digit mobile number on the record" });
      continue;
    }
    const user = userById.get(id(student.user));
    const { token, tokenHash, expiresAt } = newToken();
    const admission: any = await BranchAdmission.create({
      branch,
      kind: "update",
      student: student._id,
      tokenHash,
      expiresAt,
      prefill: {
        name: student.name,
        parentName: student.parentName || student.fatherName || student.motherName || "",
        phone,
        email: realEmail(student.email) || realEmail(user?.parentEmail) || realEmail(user?.email),
        fatherName: student.fatherName || "",
        motherName: student.motherName || "",
        school: student.school || "",
        dateOfBirth: dateText(student.dateOfBirth),
        slots: student.slots || [],
        monthlyFee: student.monthlyFee || 0,
      },
      lastSentAt: new Date(),
      createdBy: actor.id,
      createdByName: actor.name || "",
    });
    const delivery = await deliverLink(admission.toObject(), linkFor(token, request));
    results.push({ ...base, status: "sent", whatsapp: delivery.whatsapp, email: delivery.email });
  }
  for (const missing of ids.filter((value) => !students.some((student) => id(student) === value))) {
    results.push({ studentId: missing, name: "", status: "skipped", reason: "Not a student of this branch" });
  }
  const sent = results.filter((result) => result.status === "sent").length;
  if (sent) {
    void recordActivity({
      actor: actor.id,
      type: "branch.details_forms_sent",
      label: `Sent the ${branch} details form to ${sent} student${sent === 1 ? "" : "s"}`,
      entityType: "BranchAdmission",
    });
  }
  return { results, sent, skipped: results.length - sent };
}

/** The admission photo becomes the account's picture. */
async function photoToAvatar(admission: any, userId: unknown) {
  if (!admission.photo?.storedName) return false;
  const data = await readAdmissionFile(admission.photo.storedName);
  if (!data) return false;
  const extension = admission.photo.storedName.slice(admission.photo.storedName.lastIndexOf("."));
  const avatar = await saveUpload("profiles", `avatar-${id(userId)}-${Date.now()}${extension}`, data).catch(() => "");
  if (!avatar) return false;
  await User.updateOne({ _id: userId }, { $set: { avatar } }).setOptions({ allBranches: true });
  return true;
}

/**
 * Completes an existing student's record from the details form. Only answers
 * the family gave are written, so a blank box never wipes what the centre had.
 * Slots, fees and the login stay as they are.
 */
async function approveDetailsUpdate(branch: BranchKey, admission: any, input: any, actor: Actor) {
  const student: any = await BranchStudent.findOne({ _id: admission.student, branch }).lean();
  if (!student) throw new BranchError("The student this form belongs to is no longer in the portal.", 404);
  const answers = { ...(admission.form || {}), ...pickDetails(input) };
  const set: Record<string, unknown> = {};
  for (const key of ["name", "school", "parentName", "fatherName", "motherName", "address"] as const) {
    const value = text(answers[key], key === "address" ? 500 : 200);
    if (value) set[key] = value;
  }
  const phone = tenDigitPhone(answers.phone);
  if (phone) set.phone = phone;
  const email = realEmail(answers.email);
  if (email) set.email = email;
  if (answers.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(String(answers.dateOfBirth))) set.dateOfBirth = new Date(`${answers.dateOfBirth}T00:00:00Z`);
  if (!set.parentName && !student.parentName) set.parentName = set.fatherName || set.motherName;
  set.admission = admission._id;

  await BranchStudent.updateOne({ _id: student._id }, { $set: set });
  const userSet: Record<string, unknown> = {};
  if (set.name) userSet.name = set.name;
  if (set.phone) userSet.phone = set.phone;
  if (set.parentName) userSet.parentName = set.parentName;
  if (set.email) userSet.parentEmail = set.email;
  if (Object.keys(userSet).length) await User.updateOne({ _id: student.user }, { $set: userSet }).setOptions({ allBranches: true });
  const photoSet = await photoToAvatar(admission, student.user);
  await BranchAdmission.updateOne({ _id: admission._id }, { $set: { student: student._id } });

  void recordActivity({
    actor: actor.id,
    targetUser: id(student.user),
    type: "branch.details_updated",
    label: `Updated ${set.name || student.name}'s details from the family's form`,
    entityType: "BranchAdmission",
    entityId: id(admission),
  });
  return { studentId: id(student), updated: Object.keys(set).filter((key) => key !== "admission"), photoSet };
}

/** Corrections staff may make on the review screen before saving. */
function pickDetails(input: any) {
  const out: Record<string, unknown> = {};
  for (const key of ["name", "dateOfBirth", "school", "parentName", "fatherName", "motherName", "phone", "email", "address"]) {
    if (typeof input?.[key] === "string") out[key] = input[key];
  }
  return out;
}

async function findAdmission(branch: BranchKey, admissionId: string) {
  if (!isObjectId(admissionId)) throw new BranchError("Admission not found.", 404);
  const admission: any = await BranchAdmission.findOne({ _id: admissionId, branch }).lean();
  if (!admission) throw new BranchError("Admission not found.", 404);
  return admission;
}

/** Gives a still-open form a fresh link (the old one stops working) and sends it. */
async function refreshAndDeliver(admissionId: unknown, request?: Request) {
  const { token, tokenHash, expiresAt } = newToken();
  const updated: any = await BranchAdmission.findOneAndUpdate(
    { _id: admissionId, status: "sent" },
    { $set: { tokenHash, expiresAt, lastSentAt: new Date() }, $inc: { sends: 1 } },
    { new: true }
  ).lean();
  if (!updated) throw new BranchError("This form has already been filled in or closed.");
  return { updated, delivery: await deliverLink(updated, linkFor(token, request)) };
}

/** A fresh link (the old one stops working), sent again. */
export async function resendAdmission(branch: BranchKey, admissionId: string, actor: Actor, request?: Request) {
  await dbConnect();
  const admission = await findAdmission(branch, admissionId);
  if (admission.status !== "sent") throw new BranchError("This form has already been filled in or closed.");
  const { updated, delivery } = await refreshAndDeliver(admission._id, request);
  void recordActivity({
    actor: actor.id,
    type: "branch.admission_resent",
    label: `Sent the ${branch} admission form for ${updated.prefill?.name} again`,
    entityType: "BranchAdmission",
    entityId: id(updated),
  });
  return { admission: serialize(updated, await slotMap(branch)), delivery };
}

export async function cancelAdmission(branch: BranchKey, admissionId: string, actor: Actor) {
  await dbConnect();
  const admission = await findAdmission(branch, admissionId);
  if (admission.status !== "sent") throw new BranchError("Only a form that hasn't been filled in can be cancelled.");
  await BranchAdmission.updateOne(
    { _id: admission._id, status: "sent" },
    { $set: { status: "cancelled", decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: new Date() } }
  );
}

/** Turns a filled-in form into a student. Staff may correct the details, slots and fee first. */
export async function approveAdmission(branch: BranchKey, admissionId: string, input: any, actor: Actor, request?: Request) {
  await dbConnect();
  const admission = await findAdmission(branch, admissionId);
  if (admission.status !== "submitted") throw new BranchError("Only a filled-in form can be approved.");
  // Claimed first, so a double click cannot make two students.
  const claimed = await BranchAdmission.findOneAndUpdate(
    { _id: admission._id, status: "submitted" },
    { $set: { status: "approved", decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: new Date() } }
  );
  if (!claimed) throw new BranchError("This form has already been decided.");

  if (admission.kind === "update") {
    try {
      return { kind: "update" as const, ...(await approveDetailsUpdate(branch, admission, input, actor)) };
    } catch (error) {
      await BranchAdmission.updateOne(
        { _id: admission._id, status: "approved" },
        { $set: { status: "submitted" }, $unset: { decidedBy: 1, decidedByName: 1, decidedAt: 1 } }
      );
      throw error;
    }
  }

  const form = admission.form || {};
  let created: Awaited<ReturnType<typeof createStudent>>;
  try {
    created = await createStudent(
      branch,
      {
        ...form,
        ...(input || {}),
        monthlyFee: input?.monthlyFee ?? (admission.prefill?.monthlyFee || 0) / 100,
        slots: Array.isArray(input?.slots) ? input.slots : (admission.prefill?.slots || []).map(id),
        notes: text(input?.notes ?? admission.prefill?.note, 1000),
      },
      actor.id
    );
  } catch (error) {
    await BranchAdmission.updateOne(
      { _id: admission._id, status: "approved" },
      { $set: { status: "submitted" }, $unset: { decidedBy: 1, decidedByName: 1, decidedAt: 1 } }
    );
    throw error;
  }

  // The photo becomes the account's picture; the identity document stays private here.
  await photoToAvatar(admission, created.user._id);
  await Promise.all([
    BranchStudent.updateOne({ _id: created.student._id }, { $set: { admission: admission._id } }),
    BranchAdmission.updateOne({ _id: admission._id }, { $set: { student: created.student._id } }),
  ]);

  let emailSent = false;
  if (input?.sendLogin !== false) {
    const result = await sendWelcomeEmail({
      name: created.user.name,
      email: created.user.email,
      phone: created.user.phone,
      countryCode: created.user.countryCode,
      username: created.username,
      role: "student",
      temporaryPassword: created.password,
      request,
    }).catch((error) => {
      console.error("Branch admission welcome message failed", error);
      return null;
    });
    emailSent = Boolean(result?.delivered);
  }
  void recordActivity({
    actor: actor.id,
    targetUser: id(created.user),
    type: "branch.admission_approved",
    label: `Approved the ${branch} admission of ${created.user.name}`,
    entityType: "BranchAdmission",
    entityId: id(admission),
  });
  return { kind: "new" as const, studentId: id(created.student), username: created.username, password: created.password, emailSent };
}

/** Closes a form without a student. The uploaded photo and identity document are deleted. */
export async function rejectAdmission(branch: BranchKey, admissionId: string, input: any, actor: Actor) {
  await dbConnect();
  const admission = await findAdmission(branch, admissionId);
  if (admission.status !== "submitted") throw new BranchError("Only a filled-in form can be turned down.");
  const reason = text(input?.reason, 300);
  if (!reason) throw new BranchError("Say why, for the record.");
  const updated = await BranchAdmission.findOneAndUpdate(
    { _id: admission._id, status: "submitted" },
    {
      $set: { status: "rejected", rejectReason: reason, decidedBy: actor.id, decidedByName: actor.name || "", decidedAt: new Date() },
      $unset: { photo: 1, idDocument: 1 },
    }
  );
  if (!updated) throw new BranchError("This form has already been decided.");
  await removeAdmissionFiles([admission.photo?.storedName, admission.idDocument?.storedName]);
}

export async function admissionFile(branch: BranchKey, admissionId: string, kind: AdmissionFileKind) {
  await dbConnect();
  const admission = await findAdmission(branch, admissionId);
  const file = kind === "photo" ? admission.photo : admission.idDocument;
  if (!file?.storedName) return null;
  const data = await readAdmissionFile(file.storedName);
  if (!data) return null;
  const extension = file.storedName.slice(file.storedName.lastIndexOf("."));
  const who = String(admission.form?.name || admission.prefill?.name || "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { data, mimeType: file.mimeType as string, filename: `${who}-${kind === "photo" ? "photo" : "id"}${extension}` };
}

// ---------------------------------------------------------------------------
// The family's side
// ---------------------------------------------------------------------------

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  await dbConnect();
  return (await BranchAdmission.findOne({ tokenHash: hashToken(token) }).lean()) as any;
}

/** What the public form page may show: never staff notes, fees or anyone else's details. */
export async function publicAdmission(token: string) {
  const admission = await byToken(token);
  if (!admission) return null;
  const state = isExpired(admission) ? "expired" : admission.status === "sent" ? "open" : admission.status === "cancelled" ? "closed" : "received";
  const prefill = admission.prefill || {};
  return {
    state: state as "open" | "expired" | "closed" | "received",
    kind: (admission.kind || "new") as "new" | "update",
    branchLabel: BRANCH_LABELS[admission.branch as BranchKey],
    studentName: prefill.name || "",
    // The family's own details only: never fees, slots or staff notes.
    prefill: {
      name: prefill.name || "",
      parentName: prefill.parentName || "",
      phone: prefill.phone || "",
      email: prefill.email || "",
      fatherName: prefill.fatherName || "",
      motherName: prefill.motherName || "",
      school: prefill.school || "",
      dateOfBirth: prefill.dateOfBirth || "",
    },
  };
}

type IncomingFile = { kind: AdmissionFileKind; data: Uint8Array };

/** Stores a family's completed form. Files are checked before anything is written. */
export async function submitAdmission(token: string, fields: Record<string, unknown>, files: IncomingFile[]) {
  const admission = await byToken(token);
  if (!admission) throw new BranchError("This admission link is not valid.", 404);
  if (admission.status !== "sent") throw new BranchError("This form has already been sent to the centre.", 409);
  if (isExpired(admission)) throw new BranchError("This link has expired. Please ask the centre for a new one.", 410);

  const read = readAdmissionForm(fields);
  if ("error" in read) throw new BranchError(read.error);
  const checked: Record<string, { data: Uint8Array; extension: string; mimeType: string }> = {};
  for (const kind of ["photo", "idDocument"] as const) {
    const file = files.find((entry) => entry.kind === kind);
    const result = checkAdmissionFile(kind, file?.data || new Uint8Array());
    if ("error" in result) throw new BranchError(result.error);
    checked[kind] = { data: file!.data, extension: result.type.extension, mimeType: result.type.mimeType };
  }

  const stored: Record<string, { storedName: string; mimeType: string; size: number }> = {};
  try {
    for (const kind of ["photo", "idDocument"] as const) {
      const file = checked[kind];
      stored[kind] = { storedName: await saveAdmissionFile(file.data, file.extension), mimeType: file.mimeType, size: file.data.length };
    }
  } catch (error) {
    await removeAdmissionFiles(Object.values(stored).map((file) => file.storedName));
    throw error;
  }

  const updated = await BranchAdmission.findOneAndUpdate(
    { _id: admission._id, status: "sent", expiresAt: { $gt: new Date() } },
    { $set: { status: "submitted", form: read.form, photo: stored.photo, idDocument: stored.idDocument, submittedAt: new Date() } }
  );
  if (!updated) {
    await removeAdmissionFiles(Object.values(stored).map((file) => file.storedName));
    throw new BranchError("This form has already been sent to the centre.", 409);
  }
  void notifyStaff(admission.branch, read.form.name, id(admission), admission.kind === "update");
  return { studentName: read.form.name };
}

/** Tells the people who run the branch - its admin and managers - that a form is waiting. */
async function notifyStaff(branch: BranchKey, studentName: string, admissionId: string, update = false) {
  try {
    const staff: any[] = await User.find({ branch, role: "instructor", branchRole: { $in: ["admin", "manager"] }, isActive: { $ne: false } })
      .select("_id")
      .lean();
    if (!staff.length) return;
    await Notification.insertMany(
      staff.map((user) => ({
        user: user._id,
        type: "branch_admission_submitted",
        title: update ? "Student details received" : "Admission form received",
        message: update
          ? `${studentName}'s family sent their details and photo. Review them on Admissions to update the record.`
          : `${studentName}'s family filled in the ${BRANCH_LABELS[branch]} admission form. Review it to add them.`,
        metadata: { admissionId, href: "/bowbazar/admissions" },
      }))
    );
  } catch (error) {
    console.error("Branch admission staff notification failed", error);
  }
}
