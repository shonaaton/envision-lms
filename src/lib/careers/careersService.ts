import "server-only";

import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { validateRoleAssignment } from "@/lib/accessRoles";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";
import { raiseJobApplicationTask, resolveJobApplicationTask } from "@/lib/tasks/taskTriggers";
import {
  APPLICATION_STAGE_VALUES,
  JOB_STATUSES,
  defaultBasicFields,
  isPostingAcceptingApplications,
  jobPostingSchema,
  slugify,
  type ApplicationStage,
  type JobQuestion,
  type JobStatus,
  type StoredAnswer,
} from "@/lib/careers/careersConfig";
import { careersReviewers } from "@/lib/careers/careersPeople";
import { notifyReviewersAboutApplication, sendApplicationReceived, sendHired, sendInterviewScheduled, sendRejected, sendShortlisted } from "@/lib/careers/careersMessages";
import { JobApplication, JobPosting } from "@/models/Careers";
import { User, createUserWithUsername } from "@/models/User";

type Actor = { id: string; name?: string | null };

const oid = (value: unknown) => (typeof value === "string" && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined);
const str = (value: unknown) => (value == null ? "" : String(value));

// ---------------------------------------------------------------------------
// Shapes handed to pages (plain JSON)
// ---------------------------------------------------------------------------

export function shapePosting(row: any) {
  return {
    id: str(row._id),
    title: str(row.title),
    slug: str(row.slug),
    department: str(row.department),
    employmentType: str(row.employmentType),
    workMode: str(row.workMode),
    location: str(row.location),
    summary: str(row.summary),
    description: str(row.description),
    payNote: str(row.payNote),
    status: (row.status || "draft") as JobStatus,
    closesAt: row.closesAt ? new Date(row.closesAt).toISOString() : null,
    order: Number(row.order ?? 100),
    basicFields: { ...defaultBasicFields(), ...(row.basicFields || {}) },
    resume: row.resume || "optional",
    questions: (row.questions || []).map((question: any) => ({
      id: str(question.id),
      text: str(question.text),
      help: str(question.help),
      type: question.type,
      options: [...(question.options || [])],
      required: Boolean(question.required),
      active: question.active !== false,
    })) as JobQuestion[],
    hireRole: row.hireRole || "instructor",
    hireAccessRole: row.hireAccessRole ? str(row.hireAccessRole) : null,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}
export type PostingView = ReturnType<typeof shapePosting>;

export function shapeApplication(row: any) {
  return {
    id: str(row._id),
    posting: str(row.posting),
    postingTitle: str(row.postingTitle),
    department: str(row.department),
    name: str(row.name),
    email: str(row.email),
    countryCode: str(row.countryCode),
    phone: str(row.phone),
    city: str(row.city),
    age: row.age ?? null,
    currentRole: str(row.currentRole),
    experienceYears: row.experienceYears ?? null,
    languages: str(row.languages),
    profileLink: str(row.profileLink),
    fideId: str(row.fideId),
    chessRating: str(row.chessRating),
    answers: (row.answers || []).map((item: any) => ({ questionId: str(item.questionId), question: str(item.question), type: str(item.type), answer: item.answer ?? null })) as (Omit<StoredAnswer, "type"> & { type: string })[],
    resume: row.resume?.storedName ? { name: str(row.resume.name), size: Number(row.resume.size) || 0, mimeType: str(row.resume.mimeType) } : null,
    whatsappVerified: Boolean(row.whatsappVerifiedAt),
    otpFailed: Boolean(row.otpFailedAt),
    stage: (row.stage || "new") as ApplicationStage,
    rating: Number(row.rating) || 0,
    interviewAt: row.interviewAt ? new Date(row.interviewAt).toISOString() : null,
    interviewLink: str(row.interviewLink),
    interviewNote: str(row.interviewNote),
    log: (row.log || [])
      .map((entry: any) => ({ id: str(entry._id), kind: str(entry.kind), text: str(entry.text), byName: str(entry.byName), at: entry.at ? new Date(entry.at).toISOString() : null }))
      .reverse() as { id: string; kind: string; text: string; byName: string; at: string | null }[],
    convertedUser: row.convertedUser ? str(row.convertedUser) : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}
export type ApplicationView = ReturnType<typeof shapeApplication>;

/** Only submitted applications: one still waiting for its WhatsApp code is nobody's business yet. */
const SUBMITTED = { awaitingCode: { $ne: true } };

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function listPublicPostings() {
  await dbConnect();
  const rows: any[] = await JobPosting.find({ status: "open" }).sort({ order: 1, publishedAt: -1, createdAt: -1 }).lean();
  return rows.filter((row) => isPostingAcceptingApplications(row)).map(shapePosting);
}

/** The opening behind /careers/[slug]. Drafts are not found; closed ones are, so an old link explains itself. */
export async function getPublicPosting(slug: string) {
  await dbConnect();
  const row: any = await JobPosting.findOne({ slug: String(slug || "").toLowerCase(), status: { $in: ["open", "closed"] } }).lean();
  if (!row) return null;
  return { ...shapePosting(row), accepting: isPostingAcceptingApplications(row) };
}

// ---------------------------------------------------------------------------
// Openings (admin)
// ---------------------------------------------------------------------------

export async function listPostingsForAdmin() {
  await dbConnect();
  const rows: any[] = await JobPosting.find({}).sort({ status: 1, order: 1, createdAt: -1 }).lean();
  const counts: any[] = await JobApplication.aggregate([
    { $match: SUBMITTED },
    { $group: { _id: { posting: "$posting", stage: "$stage" }, count: { $sum: 1 } } },
  ]);
  const byPosting = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const key = str(row._id.posting);
    const entry = byPosting.get(key) || {};
    entry[row._id.stage] = row.count;
    byPosting.set(key, entry);
  }
  return rows.map((row) => {
    const stages = byPosting.get(str(row._id)) || {};
    const total = Object.values(stages).reduce((sum, value) => sum + value, 0);
    return { ...shapePosting(row), applicationCount: total, newCount: stages.new || 0, accepting: isPostingAcceptingApplications(row) };
  });
}

export async function getPostingForAdmin(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  await dbConnect();
  const row: any = await JobPosting.findById(id).lean();
  return row ? shapePosting(row) : null;
}

async function uniqueSlug(wanted: string, exceptId?: string) {
  const base = slugify(wanted);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash: any = await JobPosting.findOne({ slug: candidate, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select("_id").lean();
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Creates (no id) or updates an opening. Throws a ZodError or Error with a user-facing message. */
export async function savePosting(id: string | null, raw: unknown, actor: Actor) {
  const input = jobPostingSchema.parse(raw);
  await dbConnect();
  if (input.hireAccessRole) await validateRoleAssignment(input.hireAccessRole);
  const existing: any = id ? await JobPosting.findById(id).lean() : null;
  if (id && !existing) throw new Error("This opening no longer exists.");
  const slug = await uniqueSlug(input.slug || existing?.slug || input.title, id || undefined);
  const fields = {
    ...input,
    slug,
    closesAt: input.closesAt || null,
    hireAccessRole: input.hireAccessRole ? new Types.ObjectId(input.hireAccessRole) : null,
    updatedBy: oid(actor.id),
    ...(input.status === "open" && !existing?.publishedAt ? { publishedAt: new Date() } : {}),
  };
  const saved: any = existing
    ? await JobPosting.findByIdAndUpdate(id, { $set: fields }, { new: true }).lean()
    : (await JobPosting.create({ ...fields, createdBy: oid(actor.id) })).toObject();
  await recordActivity({
    actor: actor.id,
    type: existing ? "careers.posting.updated" : "careers.posting.created",
    label: `${existing ? "Updated" : "Created"} job opening "${saved.title}"`,
    entityType: "JobPosting",
    entityId: str(saved._id),
    metadata: { status: saved.status },
  });
  return shapePosting(saved);
}

export async function setPostingStatus(id: string, status: JobStatus, actor: Actor) {
  if (!JOB_STATUSES.includes(status)) throw new Error("Unknown status.");
  await dbConnect();
  const current: any = await JobPosting.findById(id).select("publishedAt title").lean();
  if (!current) throw new Error("This opening no longer exists.");
  await JobPosting.updateOne(
    { _id: id },
    { $set: { status, updatedBy: oid(actor.id), ...(status === "open" && !current.publishedAt ? { publishedAt: new Date() } : {}) } }
  );
  await recordActivity({ actor: actor.id, type: "careers.posting.status", label: `Set job opening "${current.title}" to ${status}`, entityType: "JobPosting", entityId: id });
}

export async function duplicatePosting(id: string, actor: Actor) {
  await dbConnect();
  const source: any = await JobPosting.findById(id).lean();
  if (!source) throw new Error("This opening no longer exists.");
  const { _id, createdAt, updatedAt, publishedAt, slug, __v, ...rest } = source;
  void _id; void createdAt; void updatedAt; void publishedAt; void __v;
  const copy: any = await JobPosting.create({
    ...rest,
    title: `${source.title} (copy)`,
    slug: await uniqueSlug(`${slug}-copy`),
    status: "draft",
    createdBy: oid(actor.id),
    updatedBy: oid(actor.id),
  });
  return str(copy._id);
}

/** Only an opening nobody applied to can be deleted; otherwise close it, so its applications keep their context. */
export async function deletePosting(id: string, actor: Actor) {
  await dbConnect();
  const applications = await JobApplication.countDocuments({ posting: id, ...SUBMITTED });
  if (applications) throw new Error(`${applications} application${applications === 1 ? "" : "s"} came in for this opening. Close it instead of deleting it.`);
  const removed: any = await JobPosting.findByIdAndDelete(id).lean();
  if (removed) {
    await JobApplication.deleteMany({ posting: id, awaitingCode: true });
    await recordActivity({ actor: actor.id, type: "careers.posting.deleted", label: `Deleted job opening "${removed.title}"`, entityType: "JobPosting", entityId: id });
  }
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * Called once the WhatsApp code is right (or could not be sent at all): from
 * here the application is real. `announcedAt` is claimed atomically, so a
 * double tap tells nobody twice.
 */
export async function announceJobApplication(id: string) {
  await dbConnect();
  const application: any = await JobApplication.findOneAndUpdate(
    { _id: id, announcedAt: null },
    { $set: { announcedAt: new Date(), stageChangedAt: new Date() }, $push: { log: { kind: "system", text: "Application submitted", byName: "System", at: new Date() } } },
    { new: true }
  ).lean();
  if (!application) return;
  // The review task goes to the first reviewer (Sayan Bose); both are told.
  const reviewers = await careersReviewers().catch((error) => {
    console.error("[careers] reviewer lookup failed", error);
    return [];
  });
  await Promise.all([
    raiseJobApplicationTask(application, reviewers.find((person) => person.userId)?.userId || null),
    sendApplicationReceived(application),
    notifyReviewersAboutApplication(application, reviewers).catch((error) => console.error("[careers] reviewer notice failed", error)),
  ]);
}

export type ApplicationFilters = { posting?: string; stage?: string; q?: string; from?: string; to?: string };

export function parseApplicationFilters(params: Record<string, string | string[] | undefined>): ApplicationFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value || "").trim();
  };
  return { posting: one("posting"), stage: one("stage"), q: one("q").slice(0, 80), from: one("from"), to: one("to") };
}

function applicationQuery(filters: ApplicationFilters) {
  const query: Record<string, any> = { ...SUBMITTED };
  if (filters.posting && Types.ObjectId.isValid(filters.posting)) query.posting = new Types.ObjectId(filters.posting);
  if (filters.stage && (APPLICATION_STAGE_VALUES as string[]).includes(filters.stage)) query.stage = filters.stage;
  else if (filters.stage === "active") query.stage = { $in: ["new", "shortlisted", "interview", "offered"] };
  if (filters.q) {
    const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { city: pattern }, { postingTitle: pattern }];
  }
  const range: Record<string, Date> = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.from || "")) range.$gte = new Date(`${filters.from}T00:00:00+05:30`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to || "")) range.$lte = new Date(`${filters.to}T23:59:59.999+05:30`);
  if (Object.keys(range).length) query.createdAt = range;
  return query;
}

export async function listApplications(filters: ApplicationFilters, limit = 300) {
  await dbConnect();
  const rows: any[] = await JobApplication.find(applicationQuery(filters)).sort({ createdAt: -1 }).limit(limit).lean();
  const stageCounts: any[] = await JobApplication.aggregate([
    { $match: applicationQuery({ ...filters, stage: "" }) },
    { $group: { _id: "$stage", count: { $sum: 1 } } },
  ]);
  return {
    applications: rows.map(shapeApplication),
    stageCounts: Object.fromEntries(stageCounts.map((row) => [row._id, row.count])) as Record<string, number>,
  };
}

export async function getApplication(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  await dbConnect();
  const row: any = await JobApplication.findOne({ _id: id, ...SUBMITTED }).lean();
  return row ? shapeApplication(row) : null;
}

function logEntry(kind: string, text: string, actor: Actor) {
  return { kind, text, by: oid(actor.id), byName: actor.name || "Admin", at: new Date() };
}

const MESSAGE_LABEL = (result: { email: boolean; whatsapp: boolean } | null) => {
  if (!result) return "message not sent";
  const parts = [result.email ? "email" : "", result.whatsapp ? "WhatsApp" : ""].filter(Boolean);
  return parts.length ? `${parts.join(" + ")} sent` : "no message delivered (WhatsApp template may still be off)";
};

/**
 * Moves an application to a stage. Shortlisted and Rejected message the
 * applicant unless `notify` is false; Interview has its own call
 * (scheduleInterview) and Hired goes through hireApplicant.
 */
export async function setApplicationStage(id: string, stage: ApplicationStage, actor: Actor, options: { notify?: boolean } = {}) {
  if (!(APPLICATION_STAGE_VALUES as string[]).includes(stage)) throw new Error("Unknown stage.");
  if (stage === "hired") throw new Error("Use Hire to mark someone hired.");
  await dbConnect();
  const current: any = await JobApplication.findOne({ _id: id, ...SUBMITTED }).lean();
  if (!current) throw new Error("This application no longer exists.");
  if (current.stage === stage) return;
  const notify = options.notify !== false;
  let sent: { email: boolean; whatsapp: boolean } | null = null;
  if (notify && stage === "shortlisted") sent = await sendShortlisted(current);
  if (notify && stage === "rejected") sent = await sendRejected(current);
  const note = `Stage: ${current.stage} → ${stage}${sent || (notify && ["shortlisted", "rejected"].includes(stage)) ? ` (${MESSAGE_LABEL(sent)})` : ""}`;
  await JobApplication.updateOne({ _id: id }, { $set: { stage, stageChangedAt: new Date() }, $push: { log: logEntry("stage", note, actor) } });
  if (stage !== "new") await resolveJobApplicationTask(id, actor.id, note);
}

export async function scheduleInterview(id: string, input: { at: Date; link?: string; note?: string; notify?: boolean }, actor: Actor) {
  if (!(input.at instanceof Date) || Number.isNaN(input.at.getTime())) throw new Error("Pick the interview date and time.");
  await dbConnect();
  const current: any = await JobApplication.findOne({ _id: id, ...SUBMITTED }).lean();
  if (!current) throw new Error("This application no longer exists.");
  const link = str(input.link).trim().slice(0, 500);
  const note = str(input.note).trim().slice(0, 300);
  const sent = input.notify === false ? null : await sendInterviewScheduled(current, { at: input.at, link, note });
  const { formatInterviewTime } = await import("@/lib/careers/careersMessages");
  await JobApplication.updateOne(
    { _id: id },
    {
      $set: { stage: "interview", stageChangedAt: new Date(), interviewAt: input.at, interviewLink: link, interviewNote: note },
      $push: { log: logEntry("interview", `Interview set for ${formatInterviewTime(input.at)}${input.notify === false ? "" : ` (${MESSAGE_LABEL(sent)})`}`, actor) },
    }
  );
  await resolveJobApplicationTask(id, actor.id, "Interview scheduled.");
}

export async function addApplicationNote(id: string, text: string, actor: Actor) {
  const clean = str(text).trim().slice(0, 2000);
  if (!clean) throw new Error("Write a note first.");
  await dbConnect();
  await JobApplication.updateOne({ _id: id }, { $push: { log: logEntry("note", clean, actor) } });
}

export async function rateApplication(id: string, rating: number) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  await dbConnect();
  await JobApplication.updateOne({ _id: id }, { $set: { rating: value } });
}

/** Removes an application and its resume for good. */
export async function deleteApplication(id: string, actor: Actor) {
  await dbConnect();
  const removed: any = await JobApplication.findByIdAndDelete(id).lean();
  if (!removed) return;
  if (removed.resume?.storedName) {
    const { removeResume } = await import("@/lib/careers/resumeFiles");
    await removeResume(removed.resume.storedName);
  }
  await resolveJobApplicationTask(id, actor.id, "Application deleted.");
  await recordActivity({ actor: actor.id, type: "careers.application.deleted", label: `Deleted the application from ${removed.name} for ${removed.postingTitle}`, entityType: "JobApplication", entityId: id });
}

function temporaryPassword() {
  return `ENV${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}`;
}

export type HireInput = { accountRole: "instructor" | "sub-admin" | "none"; accessRole?: string | null; email?: string; notify?: boolean };

/**
 * Hire: marks the application hired and, unless "none", creates the portal
 * account (temporary password + welcome email/WhatsApp). An email already on
 * file links to that account instead of making a second one. Staff accounts
 * (sub-admin, with or without a named role) need a Super Admin, matching
 * /api/admin/users.
 */
export async function hireApplicant(id: string, input: HireInput, actor: Actor & { isSuperAdmin: boolean }) {
  await dbConnect();
  const application: any = await JobApplication.findOne({ _id: id, ...SUBMITTED }).lean();
  if (!application) throw new Error("This application no longer exists.");
  if (application.stage === "hired") throw new Error("This applicant is already hired.");

  let userId: string | null = null;
  let accountNote = "no portal account created";
  if (input.accountRole !== "none") {
    if (input.accountRole === "sub-admin" && !actor.isSuperAdmin) throw new Error("Only Super Admins can create staff (sub-admin) accounts. Create a coach account or no account instead.");
    const email = str(input.email || application.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("An email address is needed to create the account.");
    const namedRole: any = input.accountRole === "sub-admin" && input.accessRole ? await validateRoleAssignment(input.accessRole) : null;
    const existing: any = await User.findOne({ email }).select("_id name role").lean();
    if (existing) {
      userId = str(existing._id);
      accountNote = `linked to the existing account of ${existing.name} (${existing.role}); no new account made`;
    } else {
      const password = temporaryPassword();
      const user: any = await createUserWithUsername({
        name: application.name,
        email,
        phone: application.phone,
        countryCode: application.countryCode,
        city: application.city,
        passwordHash: await bcrypt.hash(password, 10),
        tempPassword: password,
        passwordChangedAt: new Date(),
        passwordChangeSource: "registration",
        role: input.accountRole,
        ...(namedRole ? { accessRole: namedRole._id } : {}),
        accountStatus: "approved",
        isActive: true,
        fideId: application.fideId || undefined,
        rating: Number(String(application.chessRating || "").replace(/[^\d]/g, "")) || 0,
        notes: `Hired through Careers for ${application.postingTitle}.`,
      });
      userId = str(user._id);
      accountNote = `${namedRole?.name || (input.accountRole === "instructor" ? "coach" : "staff")} account created (${user.username})`;
      await sendWelcomeEmail({
        name: user.name,
        email: user.email,
        phone: user.phone,
        countryCode: user.countryCode,
        username: user.username,
        role: input.accountRole,
        roleName: namedRole?.name,
        temporaryPassword: password,
      }).catch((error) => console.error("[careers] welcome email failed", error));
      await recordActivity({
        actor: actor.id,
        targetUser: userId,
        type: "user.created",
        label: `Created ${namedRole?.name || input.accountRole} account for ${user.name} (hired through Careers)`,
        entityType: "User",
        entityId: userId,
        metadata: { role: input.accountRole, accessRole: namedRole?._id, jobApplication: id },
      });
    }
  }

  const sent = input.notify === false ? null : await sendHired(application);
  const note = `Hired - ${accountNote}${input.notify === false ? "" : ` (${MESSAGE_LABEL(sent)})`}`;
  await JobApplication.updateOne(
    { _id: id },
    { $set: { stage: "hired", stageChangedAt: new Date(), hiredAt: new Date(), ...(userId ? { convertedUser: new Types.ObjectId(userId) } : {}) }, $push: { log: logEntry("stage", note, actor) } }
  );
  await resolveJobApplicationTask(id, actor.id, note);
  return { userId, note };
}

/** Named staff roles an opening can hire into. */
export async function listHireAccessRoles() {
  await dbConnect();
  const { AccessRole } = await import("@/models/AccessRole");
  const rows: any[] = await AccessRole.find({ isActive: true, archivedAt: null }).select("name").sort({ name: 1 }).lean();
  return rows.map((row) => ({ id: str(row._id), name: str(row.name) }));
}
