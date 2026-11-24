"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, FileText, History, IndianRupee, KeyRound, Loader2, MessageCircle, Pencil, Phone, Plus, Search, Send, UserCheck, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { FEE_PLANS, FEE_PLAN_LABEL, monthLabel } from "@/lib/branch/rules";
import { cn } from "@/lib/utils";
import { Badge, BranchHeader, CredentialsNote, Drawer, EmptyState, Field, Modal, ModeBadge, MoreMenu, SlotPicker, Stat, api, rupees, slotFee, useConfirm } from "./shared";
import type { Slot } from "./SlotsClient";
import { ClassLogList, HomeworkLogList, type ClassLogEntry, type ClassLogHomework } from "./ClassLog";
import { CourseProgress, type CourseProgressData } from "./CourseProgress";

import { topicsUpTo, type BranchCourse } from "@/lib/branch/courseRules";

type Student = {
  id: string;
  name: string;
  regNo: string;
  username: string;
  status: "active" | "inactive";
  inactiveSince: string | null;
  inactiveReason: string;
  phone: string;
  email: string;
  parentName: string;
  fatherName: string;
  motherName: string;
  address: string;
  school: string;
  dateOfBirth: string | null;
  notes: string;
  monthlyFee: number;
  feeStartMonth: string;
  admissionDate: string;
  lastLoginAt: string | null;
  slots: { id: string; label: string; mode: string }[];
  pendingAmount: number;
  pendingMonths: string[];
  admissionId: string;
  welcomeSentAt: string | null;
  discount: { kind: "percent" | "flat"; value: number; reason: string } | null;
  admissionFee: number;
  feePlan: string;
  course: (CourseProgressData & { courseId: string; levelId: string }) | null;
};

type Credentials = { username: string; password: string; note?: string };

/** Quick filters the Overview links to: `?filter=owing|nologin|nodetails`. */
export type StudentQuickFilter = "" | "owing" | "nologin" | "nodetails";

export default function StudentsClient({ can, initialFilter = "", startNew = false }: { can: string[]; initialFilter?: StudentQuickFilter; startNew?: boolean }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [seesFees, setSeesFees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [slotFilter, setSlotFilter] = useState("");
  const [onlyPending, setOnlyPending] = useState(initialFilter === "owing");
  const [editing, setEditing] = useState<Partial<Student> | null>(null);
  const [leaving, setLeaving] = useState<Student | null>(null);
  const [history, setHistory] = useState<Student | null>(null);
  const [credentials, setCredentials] = useState<(Credentials & { name: string }) | null>(null);
  const [courses, setCourses] = useState<BranchCourse[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [onlyNoDetails, setOnlyNoDetails] = useState(initialFilter === "nodetails");
  const [detailsResult, setDetailsResult] = useState<DetailsResult | null>(null);
  const [sendingDetails, setSendingDetails] = useState(false);
  const [onlyNoWelcome, setOnlyNoWelcome] = useState(initialFilter === "nologin");
  const [welcomeResult, setWelcomeResult] = useState<WelcomeResult | null>(null);
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [showFilters, setShowFilters] = useState(false);
  const askedForNew = useRef(startNew);

  useEffect(() => {
    api<{ courses: BranchCourse[] }>("/api/bowbazar/courses")
      .then((data) => setCourses(data.courses))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const [studentData, slotData] = await Promise.all([
        api<{ students: Student[]; canEdit: boolean; seesFees: boolean }>("/api/bowbazar/students"),
        api<{ slots: Slot[] }>("/api/bowbazar/slots"),
      ]);
      setStudents(studentData.students);
      setCanEdit(studentData.canEdit);
      setSeesFees(studentData.seesFees);
      setSlots(slotData.slots);
      // "Add a student" on the Overview opens the form once the slots are in.
      if (askedForNew.current && studentData.canEdit) setEditing({ slots: [], monthlyFee: 0 });
      askedForNew.current = false;
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => {
      if (status !== "all" && student.status !== status) return false;
      if (slotFilter && !student.slots.some((slot) => slot.id === slotFilter)) return false;
      if (onlyPending && !student.pendingAmount) return false;
      if (onlyNoDetails && student.admissionId) return false;
      if (onlyNoWelcome && student.welcomeSentAt) return false;
      if (courseFilter === "none" && student.course) return false;
      if (courseFilter && courseFilter !== "none" && student.course?.levelId !== courseFilter && student.course?.courseId !== courseFilter) return false;
      if (!q) return true;
      return [student.name, student.regNo, student.username, student.phone, student.parentName, student.fatherName, student.motherName, student.school]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [students, query, status, slotFilter, onlyPending, courseFilter, onlyNoDetails, onlyNoWelcome]);
  const shownPicked = shown.filter((student) => picked.has(student.id));
  const togglePick = (studentId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const active = students.filter((student) => student.status === "active");
  const counts = {
    active: active.length,
    inactive: students.length - active.length,
    owing: students.filter((student) => student.pendingAmount > 0).length,
    noLogin: active.filter((student) => !student.welcomeSentAt).length,
    noDetails: active.filter((student) => !student.admissionId).length,
  };
  const anyQuick = onlyPending || onlyNoWelcome || onlyNoDetails;
  /** The cards at the top work as one-tap filters; tapping the chosen one again clears it. */
  function quick(filter: StudentQuickFilter) {
    const already = (filter === "owing" && onlyPending) || (filter === "nologin" && onlyNoWelcome) || (filter === "nodetails" && onlyNoDetails);
    setOnlyPending(!already && filter === "owing");
    setOnlyNoWelcome(!already && filter === "nologin");
    setOnlyNoDetails(!already && filter === "nodetails");
    if (filter === "") setStatus("active");
  }

  async function reactivate(student: Student) {
    try {
      await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "status", status: "active" } });
      toast.success(`${student.name} is active again. Billing restarts this month.`);
      void load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  /** The details form: the admission form, pre-filled, that completes an existing record. */
  async function sendDetails(list: Student[]) {
    if (!list.length) return;
    const who = list.length === 1 ? `${list[0].name}'s family` : `the families of ${list.length} students`;
    if (
      !(await confirm({
        title: `Send the details form to ${who}?`,
        message: `It goes on WhatsApp${list.length === 1 ? "" : " (and email where known)"}. They add a photo, an ID document and anything missing.`,
        confirmLabel: "Send form",
      }))
    )
      return;
    setSendingDetails(true);
    try {
      const data = await api<DetailsResult>("/api/bowbazar/admissions", { method: "POST", json: { action: "details", studentIds: list.map((student) => student.id) } });
      setDetailsResult(data);
      setPicked(new Set());
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSendingDetails(false);
    }
  }

  /** Each family's own WhatsApp: the username and a private link to choose the password. */
  async function sendWelcome(list: Student[]) {
    if (!list.length) return;
    const who = list.length === 1 ? `${list[0].name}'s family` : `${list.length} families, each in their own message`;
    if (
      !(await confirm({
        title: `Send the welcome + login to ${who}?`,
        message: "The message carries the username and a set-password link. A link sent earlier stops working; the current password keeps working until they set a new one.",
        confirmLabel: "Send welcome",
      }))
    )
      return;
    setSendingWelcome(true);
    try {
      const data = await api<WelcomeResult>("/api/bowbazar/students/welcome", { method: "POST", json: { studentIds: list.map((student) => student.id) } });
      setWelcomeResult(data);
      setPicked(new Set());
      void load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSendingWelcome(false);
    }
  }

  async function resetPassword(student: Student) {
    if (!(await confirm({ title: `Give ${student.name} a new password?`, message: "The old one stops working straight away.", confirmLabel: "Make new password", danger: true }))) return;
    try {
      const data = await api<Credentials>(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "resetPassword" } });
      setCredentials({ ...data, name: student.name });
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Students"
        subtitle={loading ? "Loading..." : `${counts.active} active · ${counts.inactive} inactive`}
        can={can}
        actions={
          canEdit && (
            <>
              {seesFees && (
                <Link href="/bowbazar/import" className="btn-outline h-10">
                  <FileSpreadsheet size={16} /> Import from Excel
                </Link>
              )}
              <button type="button" className="btn-primary h-10" onClick={() => setEditing({ slots: [], monthlyFee: 0 })}>
                <Plus size={16} /> Add student
              </button>
            </>
          )
        }
      />

      {confirmDialog}
      {credentials && (
        <Modal
          title={credentials.name}
          onClose={() => setCredentials(null)}
          footer={<button type="button" className="btn-primary h-10" onClick={() => setCredentials(null)}>Done</button>}
        >
          <p>Shown once. Copy them now if the family needs them.</p>
          <CredentialsNote {...credentials} />
        </Modal>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Active"
          value={loading ? "…" : counts.active}
          hint={`${counts.inactive} inactive`}
          icon={<Users size={16} />}
          onClick={() => quick("")}
          active={!anyQuick && status === "active"}
        />
        {seesFees && (
          <Stat
            label="Fees pending"
            value={loading ? "…" : counts.owing}
            tone={counts.owing ? "bad" : "good"}
            hint="students owing"
            icon={<IndianRupee size={16} />}
            onClick={() => quick("owing")}
            active={onlyPending}
          />
        )}
        <Stat
          label="Login not sent"
          value={loading ? "…" : counts.noLogin}
          tone={counts.noLogin ? "warn" : "good"}
          hint="active families"
          icon={<KeyRound size={16} />}
          onClick={() => quick("nologin")}
          active={onlyNoWelcome}
        />
        <Stat
          label="Details missing"
          value={loading ? "…" : counts.noDetails}
          tone={counts.noDetails ? "warn" : "good"}
          hint="no details form back"
          icon={<FileText size={16} />}
          onClick={() => quick("nodetails")}
          active={onlyNoDetails}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-md shadow-brand-900/5 lg:flex-row lg:items-center">
        <div className="flex gap-2 lg:flex-1">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-9" placeholder="Search name, parent, phone, school" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button
            type="button"
            className={cn("btn-outline h-10 shrink-0 px-3 lg:hidden", showFilters && "border-brand bg-brand-50")}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            Filters{(status !== "active" || slotFilter || courseFilter) && " •"}
          </button>
        </div>
        <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center", !showFilters && "hidden lg:flex")}>
        <select className="input lg:w-40" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <select className="input lg:w-52" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
          <option value="">Every slot</option>
          {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
        </select>
        <select className="input lg:w-56" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
          <option value="">Every course</option>
          <option value="none">No course yet</option>
          {courses.map((course) => (
            <optgroup key={course.id} label={course.name}>
              <option value={course.id}>{course.name} (every level)</option>
              {course.levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
            </optgroup>
          ))}
        </select>
        </div>
      </div>

      {welcomeResult && (
        <Drawer
          title="Welcome + login"
          subtitle={`Set-password link made for ${welcomeResult.sent} ${welcomeResult.sent === 1 ? "family" : "families"}${welcomeResult.sent > 0 ? ` · ${welcomeResult.viaWhatsApp} sent on WhatsApp` : ""}${welcomeResult.skipped > 0 ? ` · ${welcomeResult.skipped} skipped` : ""}`}
          onClose={() => setWelcomeResult(null)}
          footer={<button type="button" className="btn-primary h-10" onClick={() => setWelcomeResult(null)}>Done</button>}
        >
        <section className="text-sm text-sky-950">
          {welcomeResult.sent > welcomeResult.viaWhatsApp && (
            <p className="mt-1 text-xs font-bold">
              WhatsApp couldn&apos;t send {welcomeResult.sent - welcomeResult.viaWhatsApp} automatically (the message may still be waiting for Meta&apos;s approval). Tap Open WhatsApp on each one: the message is typed for you, press send.
            </p>
          )}
          <ul className="mt-2 divide-y divide-sky-100">
            {welcomeResult.results.map((result) => (
              <li key={result.studentId} className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs">
                <span>
                  <span className="font-bold">{result.name || result.studentId}</span>
                  {result.username && <span className="ml-1 font-mono text-sky-800">{result.username}</span>}
                  {result.status === "skipped" && <span className="ml-1 text-amber-800">skipped: {result.reason}</span>}
                  {result.whatsapp === "sent" && <span className="ml-1 text-emerald-700">sent on WhatsApp</span>}
                </span>
                {result.whatsappLink && (
                  <a href={result.whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-bold text-white hover:bg-emerald-700">
                    <MessageCircle size={13} /> Open WhatsApp
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Each link works for 7 days and only once. Sending again makes a new link.</p>
        </section>
        </Drawer>
      )}

      {detailsResult && (
        <Drawer
          title="Details form"
          subtitle={`Sent to ${detailsResult.sent} ${detailsResult.sent === 1 ? "family" : "families"}${detailsResult.skipped > 0 ? `, ${detailsResult.skipped} skipped` : ""}`}
          onClose={() => setDetailsResult(null)}
          footer={<button type="button" className="btn-primary h-10" onClick={() => setDetailsResult(null)}>Done</button>}
        >
        <section className="text-sm text-emerald-950">
          <ul className="space-y-1.5 text-xs">
            {detailsResult.results.map((result) => (
              <li key={result.studentId}>
                <span className="font-bold">{result.name || result.studentId}</span>:{" "}
                {result.status === "sent"
                  ? result.whatsapp !== "failed"
                    ? `sent on WhatsApp${result.email === "sent" ? " and email" : ""}`
                    : result.email === "sent"
                      ? "sent by email only. WhatsApp didn't go; Send again on Admissions gives a link to share"
                      : "form made, but WhatsApp didn't go and there is no email. Use Send again on Admissions for a link to share by hand"
                  : <span className="text-amber-800">skipped: {result.reason}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs">Forms that come back wait under Admissions → To review. Saving one fills in the student&apos;s record and photo, with no new account.</p>
        </section>
        </Drawer>
      )}

      {canEdit && shown.length > 0 && (
        <BulkCourseBar
          courses={courses}
          shown={shown}
          picked={shownPicked}
          onPickAll={(all) => setPicked(all ? new Set(shown.map((student) => student.id)) : new Set())}
          sendingDetails={sendingDetails}
          onSendDetails={() => void sendDetails(shownPicked)}
          sendingWelcome={sendingWelcome}
          onSendWelcome={() => void sendWelcome(shownPicked)}
          onDone={() => {
            setPicked(new Set());
            void load();
          }}
        />
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md shadow-brand-900/5">
        {loading && (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading students...
          </div>
        )}
        {!loading && !shown.length && (
          <EmptyState
            icon={<Users size={20} />}
            title={students.length ? "No students match" : "No students yet"}
            hint={students.length ? "Try another search or clear the filters." : "Add a student or import the centre's list."}
            action={
              students.length > 0 && (
                <button
                  type="button"
                  className="btn-outline h-9 px-3 text-xs"
                  onClick={() => {
                    setQuery("");
                    setSlotFilter("");
                    setCourseFilter("");
                    quick("");
                  }}
                >
                  Clear filters
                </button>
              )
            }
          />
        )}
        <div className="divide-y divide-slate-100">
          {shown.map((student) => (
            <article key={student.id} className={cn("flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between", picked.has(student.id) && "bg-brand-50/50")}>
              <div className="flex min-w-0 gap-3">
                {canEdit && (
                  <input
                    type="checkbox"
                    className="mt-3 h-4 w-4 shrink-0 accent-brand"
                    aria-label={`Select ${student.name}`}
                    checked={picked.has(student.id)}
                    onChange={() => togglePick(student.id)}
                  />
                )}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black",
                    student.status === "active" ? "bg-brand-50 text-brand" : "bg-slate-100 text-slate-400"
                  )}
                  aria-hidden
                >
                  {initials(student.name)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button type="button" className="text-left text-base font-black text-slate-950 hover:text-brand" onClick={() => setHistory(student)}>
                      {student.name}
                    </button>
                    <span className="font-mono text-xs text-slate-500">{[student.regNo, student.username].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {student.status === "inactive" && <Badge tone="muted">Inactive</Badge>}
                    {seesFees &&
                      student.status === "active" &&
                      (student.pendingAmount > 0 ? (
                        <Badge tone="bad" dot>
                          <span title={student.pendingMonths.map(monthLabel).join(", ")}>
                            {rupees(student.pendingAmount)} due · {student.pendingMonths.length} mo
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone="good">Paid up</Badge>
                      ))}
                    {!student.admissionId && student.status === "active" && <Badge tone="warn">Details not received</Badge>}
                    {student.status === "active" &&
                      (student.welcomeSentAt ? (
                        <Badge tone="info">
                          <span title={`Welcome sent ${new Date(student.welcomeSentAt).toLocaleString("en-IN")}`}>
                            Login sent {new Date(student.welcomeSentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone="muted">Login not sent</Badge>
                      ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
                    <span>{[student.parentName, student.school].filter(Boolean).join(" · ") || (student.phone ? "" : "No contact details")}</span>
                    {student.phone && (
                      <a href={`tel:+91${student.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                        <Phone size={13} /> {student.phone}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {student.slots.map((slot) => (
                      <span key={slot.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand">
                        {slot.label} {slot.mode === "online" && <ModeBadge mode="online" />}
                      </span>
                    ))}
                    {!student.slots.length && student.status === "active" && <Badge tone="warn">No slot</Badge>}
                    {student.course ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-800" title={student.course.next ? `Next: ${student.course.next}` : undefined}>
                        {[student.course.courseName, student.course.levelName].filter(Boolean).join(" - ")}
                        {student.course.total > 0 && ` · ${student.course.done}/${student.course.total}`}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">No course</span>
                    )}
                  </div>
                  {student.status === "inactive" && (
                    <div className="text-xs text-slate-500">
                      Left {student.inactiveSince ? new Date(student.inactiveSince).toLocaleDateString("en-IN") : ""} · {student.inactiveReason}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-3 md:justify-end md:border-0 md:pt-0">
                {seesFees && (
                  <div className="md:mr-2 md:text-right">
                    <div className="text-sm font-bold text-slate-700">
                      {rupees(student.monthlyFee)}/month
                      {student.feePlan && student.feePlan !== "monthly" && (
                        <span className="ml-1 text-xs font-semibold text-brand">· {FEE_PLAN_LABEL[student.feePlan as keyof typeof FEE_PLAN_LABEL]?.split(" ")[0]}</span>
                      )}
                    </div>
                    {student.discount && (
                      <div className="text-xs text-slate-500">
                        {student.discount.kind === "percent" ? `${student.discount.value}%` : rupees(student.discount.value)} off{student.discount.reason ? ` · ${student.discount.reason}` : ""}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-outline h-9 px-3 text-xs" onClick={() => setHistory(student)}>
                    <History size={14} /> Classes
                  </button>
                  {canEdit && (
                    <>
                      <button type="button" className="btn-outline h-9 px-3 text-xs" onClick={() => setEditing(student)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <MoreMenu
                        label={`More for ${student.name}`}
                        items={[
                          { label: "Send details form", icon: <Send size={15} />, onClick: () => void sendDetails([student]) },
                          { label: "Send welcome + login", icon: <MessageCircle size={15} />, onClick: () => void sendWelcome([student]) },
                          Boolean(student.phone) && {
                            label: "WhatsApp the family",
                            icon: <MessageCircle size={15} />,
                            onClick: () => window.open(`https://wa.me/91${student.phone}`, "_blank", "noopener"),
                          },
                          { label: "New password", icon: <KeyRound size={15} />, onClick: () => void resetPassword(student) },
                          student.status === "active"
                            ? { label: "Mark inactive", icon: <UserX size={15} />, danger: true, onClick: () => setLeaving(student) }
                            : { label: "Reactivate", icon: <UserCheck size={15} />, onClick: () => void reactivate(student) },
                        ]}
                      />
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {editing && (
        <StudentDrawer
          student={editing}
          slots={slots}
          courses={courses}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            if (created) setCredentials(created);
            void load();
          }}
        />
      )}
      {leaving && <LeaveDrawer student={leaving} onClose={() => setLeaving(null)} onDone={() => { setLeaving(null); void load(); }} />}
      {history && <HistoryDrawer student={history} canEdit={canEdit} onClose={() => setHistory(null)} onChanged={() => void load()} />}
    </div>
  );
}

type StudentHistory = {
  course: CourseProgressData | null;
  classes: ClassLogEntry[];
  homework: ClassLogHomework[];
  summary: { attended: number; marked: number; absent: number };
  lastMonth: { attended: number; marked: number };
};

function HistoryDrawer({ student, canEdit, onClose, onChanged }: { student: Student; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<StudentHistory | null>(null);
  const [marking, setMarking] = useState(false);
  const loadHistory = useCallback(() => {
    api<StudentHistory>(`/api/bowbazar/students/${student.id}/history`)
      .then(setData)
      .catch((error) => toast.error(error.message));
  }, [student.id]);
  useEffect(loadHistory, [loadHistory]);

  async function mark(change: { done?: string[]; undone?: string[]; replace?: boolean }) {
    if (!data?.course?.levelId) return;
    setMarking(true);
    try {
      await api("/api/bowbazar/courses/progress", { method: "POST", json: { studentIds: [student.id], levelId: data.course.levelId, ...change } });
      loadHistory();
      onChanged();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setMarking(false);
    }
  }
  return (
    <Drawer side title={student.name} onClose={onClose}>
      {!data ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">Last 30 days</div>
              <div className="text-lg font-black text-slate-950">{data.lastMonth.attended}/{data.lastMonth.marked} classes</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-bold uppercase text-slate-500">All recorded</div>
              <div className="text-lg font-black text-slate-950">{data.summary.attended}/{data.summary.marked} classes</div>
            </div>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-black text-slate-950">Course</h3>
            {data.course ? (
              <CourseProgress course={data.course} busy={marking} onMark={canEdit ? (change) => void mark(change) : undefined} />
            ) : (
              <p className="text-sm text-slate-500">Not on a course yet. Set one with Edit.</p>
            )}
          </section>
          <section>
            <h3 className="mb-1 text-sm font-black text-slate-950">Portal homework</h3>
            <HomeworkLogList homework={data.homework} linkTo={(id) => `/homework/${id}/review`} />
          </section>
          <section>
            <h3 className="mb-1 text-sm font-black text-slate-950">Classes</h3>
            <ClassLogList classes={data.classes} />
          </section>
        </>
      )}
    </Drawer>
  );
}

/** Up to two letters for the round name badge on a row. */
function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function StudentDrawer({
  student,
  slots,
  courses,
  onClose,
  onSaved,
}: {
  student: Partial<Student>;
  slots: Slot[];
  courses: BranchCourse[];
  onClose: () => void;
  onSaved: (created?: Credentials & { name: string }) => void;
}) {
  const isNew = !student.id;
  const [form, setForm] = useState({
    name: student.name || "",
    phone: student.phone || "",
    email: student.email || "",
    fatherName: student.fatherName || "",
    motherName: student.motherName || "",
    address: student.address || "",
    school: student.school || "",
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    monthlyFee: student.monthlyFee ? String(student.monthlyFee / 100) : "",
    discountKind: student.discount?.kind || "none",
    discountValue: student.discount ? String(student.discount.kind === "flat" ? student.discount.value / 100 : student.discount.value) : "",
    discountReason: student.discount?.reason || "",
    admissionFee: "",
    feePlan: student.feePlan || "monthly",
    notes: student.notes || "",
    slots: (student.slots || []).map((slot) => slot.id),
    courseId: student.course?.courseId || "",
    levelId: student.course?.levelId || "",
    sendLogin: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  // A new student's admission fee starts at the branch's setting.
  useEffect(() => {
    if (!isNew) return;
    api<{ settings: { admissionFee: number } }>("/api/bowbazar/settings")
      .then((data) => setForm((current) => (current.admissionFee === "" ? { ...current, admissionFee: String(data.settings.admissionFee / 100) } : current)))
      .catch(() => undefined);
  }, [isNew]);

  async function save() {
    setSaving(true);
    try {
      if (isNew) {
        const data = await api<{ username: string; password: string; welcomeSent: boolean }>("/api/bowbazar/students", { method: "POST", json: form });
        toast.success(`${form.name} added.`);
        onSaved({
          name: form.name,
          username: data.username,
          password: data.password,
          note: form.sendLogin ? (data.welcomeSent ? "Also sent to the family by email and WhatsApp." : "Sending to the family did not go through - share these by hand.") : undefined,
        });
      } else {
        await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: form });
        toast.success("Saved.");
        onSaved();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={isNew ? "Add student" : `Edit ${student.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} {isNew ? "Add student" : "Save"}
          </button>
        </>
      }
    >
      <Field label="Student's name *">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Father's name">
          <input className="input" value={form.fatherName} onChange={(event) => set({ fatherName: event.target.value })} />
        </Field>
        <Field label="Mother's name">
          <input className="input" value={form.motherName} onChange={(event) => set({ motherName: event.target.value })} />
        </Field>
        <Field label="Parent's phone *" hint="WhatsApp number">
          <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
        </Field>
        <Field label="School">
          <input className="input" value={form.school} onChange={(event) => set({ school: event.target.value })} />
        </Field>
        <Field label="Date of birth">
          <input className="input" type="date" value={form.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} />
        </Field>
      </div>
      <Field label="Address">
        <textarea className="input min-h-[64px]" value={form.address} onChange={(event) => set({ address: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Monthly fee (₹)" hint="Filled in when you pick slots: 1 slot ₹1,000, 2 slots ₹1,500. Change it for a special case. No GST.">
          <input className="input" inputMode="decimal" value={form.monthlyFee} onChange={(event) => set({ monthlyFee: event.target.value })} />
        </Field>
        {isNew && (
          <Field label="Admission fee (₹)" hint="Once, on the first bill. 0 for none.">
            <input className="input" inputMode="decimal" value={form.admissionFee} onChange={(event) => set({ admissionFee: event.target.value })} />
          </Field>
        )}
      </div>
      <Field label="Fee plan" hint="A longer plan bills the whole period at its start, at the plan discount set in Branch Settings.">
        <select className="input" value={form.feePlan} onChange={(event) => set({ feePlan: event.target.value })}>
          {FEE_PLANS.map((plan) => (
            <option key={plan} value={plan}>{FEE_PLAN_LABEL[plan]}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Discount">
          <select className="input" value={form.discountKind} onChange={(event) => set({ discountKind: event.target.value })}>
            <option value="none">None</option>
            <option value="percent">Percentage</option>
            <option value="flat">Fixed ₹ a month</option>
          </select>
        </Field>
        {form.discountKind !== "none" && (
          <>
            <Field label={form.discountKind === "percent" ? "Percent off" : "₹ off each month"}>
              <input className="input" inputMode="decimal" value={form.discountValue} onChange={(event) => set({ discountValue: event.target.value })} />
            </Field>
            <Field label="Why">
              <input className="input" value={form.discountReason} placeholder="e.g. Sibling" onChange={(event) => set({ discountReason: event.target.value })} />
            </Field>
          </>
        )}
      </div>
      {!isNew && form.discountKind !== (student.discount?.kind || "none") && (
        <p className="text-xs text-slate-500">A discount change applies to bills raised from now on. Adjust bills already raised on the Fees page.</p>
      )}
      <SlotPicker slots={slots} value={form.slots} onChange={(value) => set({ slots: value, ...slotFee(value) })} seatedIn={(student.slots || []).map((slot) => slot.id)} />
      <CoursePicker courses={courses} courseId={form.courseId} levelId={form.levelId} onChange={(courseId, levelId) => set({ courseId, levelId })} />
      <Field label="Notes">
        <textarea className="input min-h-[64px]" value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
      {student.admissionId && (
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <a className="text-brand hover:underline" href={`/api/bowbazar/admissions/${student.admissionId}/file?kind=photo`} target="_blank" rel="noreferrer">Admission photo</a>
          <a className="text-brand hover:underline" href={`/api/bowbazar/admissions/${student.admissionId}/file?kind=idDocument`} target="_blank" rel="noreferrer">Identity document</a>
        </div>
      )}
      {isNew && (
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.sendLogin} onChange={(event) => set({ sendLogin: event.target.checked })} />
          Send the login details to the family (email + WhatsApp)
        </label>
      )}
    </Drawer>
  );
}

function LeaveDrawer({ student, onClose, onDone }: { student: Student; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [since, setSince] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/students/${student.id}`, { method: "PATCH", json: { action: "status", status: "inactive", reason, since } });
      toast.success(`${student.name} marked inactive. Their seat is free.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`Mark ${student.name} inactive`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10 bg-red-700 hover:bg-red-800" onClick={save} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} Mark inactive
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Their seat in {student.slots.map((slot) => slot.label).join(", ") || "their slot"} frees up, no new monthly bills are raised, and their login loses homework and tournaments. Bills already raised stay on record.
      </p>
      <Field label="Left on">
        <input type="date" className="input" value={since} onChange={(event) => setSince(event.target.value)} />
      </Field>
      <Field label="Reason *">
        <textarea className="input min-h-[80px]" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. exams, moved away, fees" />
      </Field>
    </Drawer>
  );
}

/** The academy course and level a student is on: the same syllabus as online. */
function CoursePicker({
  courses,
  courseId,
  levelId,
  onChange,
}: {
  courses: BranchCourse[];
  courseId: string;
  levelId: string;
  onChange: (courseId: string, levelId: string) => void;
}) {
  const course = courses.find((item) => item.id === courseId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Course" hint="The academy's syllabus; the register suggests its topics.">
        <select
          className="input"
          value={courseId}
          onChange={(event) => {
            const next = courses.find((item) => item.id === event.target.value);
            onChange(event.target.value, next?.levels[0]?.id || "");
          }}
        >
          <option value="">No course</option>
          {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      {course && course.levels.length > 0 && (
        <Field label="Level">
          <select className="input" value={levelId} onChange={(event) => onChange(courseId, event.target.value)}>
            {course.levels.map((level) => (
              <option key={level.id} value={level.id}>{level.name} ({level.topics.length} topics)</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

/** Puts the ticked students on one course level, e.g. a whole slot after the import. */
function BulkCourseBar({
  courses,
  shown,
  picked,
  onPickAll,
  onDone,
  onSendDetails,
  sendingDetails,
  onSendWelcome,
  sendingWelcome,
}: {
  courses: BranchCourse[];
  shown: Student[];
  picked: Student[];
  onPickAll: (all: boolean) => void;
  onDone: () => void;
  onSendDetails: () => void;
  sendingDetails: boolean;
  onSendWelcome: () => void;
  sendingWelcome: boolean;
}) {
  const [courseId, setCourseId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [upTo, setUpTo] = useState("");
  const [saving, setSaving] = useState(false);
  const allPicked = picked.length > 0 && picked.length === shown.length;
  const level = courses.find((item) => item.id === courseId)?.levels.find((item) => item.id === levelId);

  async function apply() {
    setSaving(true);
    try {
      const studentIds = picked.map((student) => student.id);
      await api("/api/bowbazar/students/course", { method: "POST", json: { studentIds, courseId, levelId } });
      // Where the group already is in the syllabus: every topic up to the chosen one counts as learnt.
      if (level && upTo) {
        await api("/api/bowbazar/courses/progress", { method: "POST", json: { studentIds, levelId, done: topicsUpTo(level, upTo), replace: true } });
      }
      const course = courses.find((item) => item.id === courseId);
      const reached = level?.topics.find((topic) => topic.id === upTo)?.name;
      toast.success(course ? `${picked.length} put on ${course.name}${reached ? `, done up to "${reached}"` : ""}.` : `${picked.length} taken off their course.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand/10 bg-white p-3 shadow-sm lg:flex-row lg:items-end">
      <label className="flex items-center gap-2 whitespace-nowrap pb-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={allPicked} onChange={(event) => onPickAll(event.target.checked)} />
        {picked.length ? `${picked.length} selected` : "Select all shown"}
      </label>
      {picked.length > 0 && (
        <>
          <div className="min-w-0 flex-1">
            <CoursePicker
              courses={courses}
              courseId={courseId}
              levelId={levelId}
              onChange={(nextCourse, nextLevel) => {
                setCourseId(nextCourse);
                setLevelId(nextLevel);
                setUpTo("");
              }}
            />
            {level && level.topics.length > 0 && (
              <Field label="Already done up to" hint="Topics learnt before the portal. Later classes tick the rest by themselves.">
                <select className="input" value={upTo} onChange={(event) => setUpTo(event.target.value)}>
                  <option value="">Nothing yet / leave as it is</option>
                  {level.topics.map((topic, index) => (
                    <option key={topic.id} value={topic.id}>{index + 1}. {topic.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <button type="button" className="btn-primary h-10 shrink-0" onClick={apply} disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />} {courseId ? "Set course" : "Remove course"}
          </button>
          <button type="button" className="btn-outline h-10 shrink-0" onClick={onSendDetails} disabled={sendingDetails}>
            {sendingDetails ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send details form to {picked.length}
          </button>
          <button type="button" className="btn-outline h-10 shrink-0" onClick={onSendWelcome} disabled={sendingWelcome}>
            {sendingWelcome ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} Send welcome + login to {picked.length}
          </button>
        </>
      )}
    </div>
  );
}

type DetailsResult = {
  sent: number;
  skipped: number;
  results: { studentId: string; name: string; status: "sent" | "skipped"; reason?: string; whatsapp?: string; email?: string }[];
};

type WelcomeResult = {
  sent: number;
  skipped: number;
  viaWhatsApp: number;
  results: { studentId: string; name: string; username: string; status: "sent" | "skipped"; reason?: string; whatsapp?: string; whatsappLink?: string }[];
};
