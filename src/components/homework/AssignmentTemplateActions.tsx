"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, FileUp, Pencil, PlayCircle, Search, Send, Trash2, Upload, Users, X } from "lucide-react";

type AssignmentTarget = { _id: string; name: string; email?: string; username?: string; students?: AssignmentTarget[] };
type ClassroomTarget = { _id: string; title: string };
type HomeworkTargets = { classrooms: ClassroomTarget[]; batches: AssignmentTarget[]; students: AssignmentTarget[] };

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ImportHomeworkPgnButton() {
  const router = useRouter();

  async function runImport() {
    const response = await fetch("/api/admin/assignment-templates/from-pgns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importBatchId: new Date().toISOString() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not import PGN templates");
    toast.success(`Imported ${data.imported || 0} homework template${Number(data.imported || 0) === 1 ? "" : "s"}`);
    router.refresh();
  }

  return (
    <button type="button" onClick={runImport} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-black text-white">
      <FileUp size={16} /> Import HW PGNs
    </button>
  );
}

export function UploadTemplateButton() {
  const router = useRouter();

  async function upload(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const response = await fetch("/api/admin/assignment-templates/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Could not upload template");
      toast.success(`Uploaded ${data.imported || 0} template${Number(data.imported || 0) === 1 ? "" : "s"}`);
      router.refresh();
    } catch {
      toast.error("Upload a valid JSON template file");
    }
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-brand/20 bg-white px-4 py-2 text-sm font-black text-brand shadow-sm hover:bg-brand/5">
      <Upload size={16} /> Upload Template
      <input className="hidden" type="file" accept=".json,application/json" onChange={(event) => upload(event.target.files?.[0])} />
    </label>
  );
}

export function TemplateRowActions({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex items-center gap-1">
      <AssignTemplateButton id={id} title={title} />
      <Link href={`/admin/homework-templates/${id}/preview`} className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-100 text-emerald-700 hover:bg-emerald-50" title="Solve/check template">
        <PlayCircle size={15} />
      </Link>
      <Link href={`/admin/homework-templates/${id}/edit`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" title="Edit template">
        <Pencil size={15} />
      </Link>
      <DeleteTemplateButton id={id} />
    </div>
  );
}

export function AssignTemplateButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [targets, setTargets] = useState<HomeworkTargets>({ classrooms: [], batches: [], students: [] });
  const [classroomId, setClassroomId] = useState("");
  const [targetMode, setTargetMode] = useState<"batches" | "students">("batches");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState(defaultDeadline);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/homework/targets", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load students and batches");
        const nextTargets = {
          classrooms: Array.isArray(data.classrooms) ? data.classrooms : [],
          batches: Array.isArray(data.batches) ? data.batches : [],
          students: Array.isArray(data.students) ? data.students : [],
        };
        setTargets(nextTargets);
        setClassroomId((current) => current || nextTargets.classrooms[0]?._id || "");
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [open]);

  const availableTargets = useMemo(() => {
    const source = targetMode === "batches" ? targets.batches : targets.students;
    const search = query.trim().toLowerCase();
    if (!search) return source;
    return source.filter((target) => `${target.name} ${target.email || ""} ${target.username || ""}`.toLowerCase().includes(search));
  }, [query, targetMode, targets.batches, targets.students]);

  function chooseMode(mode: "batches" | "students") {
    setTargetMode(mode);
    setSelectedIds([]);
    setQuery("");
  }

  function toggleTarget(targetId: string) {
    setSelectedIds((current) => current.includes(targetId) ? current.filter((item) => item !== targetId) : [...current, targetId]);
  }

  function close() {
    if (assigning) return;
    setOpen(false);
    setSelectedIds([]);
    setQuery("");
  }

  async function assign() {
    if (!classroomId) return toast.error("Choose a classroom");
    if (!selectedIds.length) return toast.error(`Choose at least one ${targetMode === "batches" ? "batch" : "student"}`);
    if (!dueAt) return toast.error("Choose the last submission date");
    const deadline = new Date(dueAt);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) return toast.error("Choose a future submission deadline");

    setAssigning(true);
    const response = await fetch(`/api/admin/assignment-templates/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classroomId, targetMode, targetIds: selectedIds, dueAt: deadline.toISOString() }),
    });
    const data = await response.json().catch(() => ({}));
    setAssigning(false);
    if (!response.ok) return toast.error(data.error || "Could not assign this homework template");
    toast.success(`Assignment sent to ${data.assignedRecipientCount} student${Number(data.assignedRecipientCount) === 1 ? "" : "s"}.`, { duration: 6000 });
    setOpen(false);
    setSelectedIds([]);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-purple-100 px-2.5 text-xs font-black text-purple-700 hover:bg-purple-50" title="Assign this template">
        <Send size={14} /> Assign
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" onMouseDown={close}>
          <div role="dialog" aria-modal="true" aria-labelledby={`assign-template-${id}`} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-purple-700">Manual assignment</div>
                <h3 id={`assign-template-${id}`} className="mt-1 text-xl font-black text-slate-950">Assign {title}</h3>
                <p className="mt-1 text-sm text-slate-500">Choose recipients and the last date for submission. This does not enable auto-assignment.</p>
              </div>
              <button type="button" onClick={close} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-600" aria-label="Close assignment window"><X size={16} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Classroom
                  <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)} className="input mt-1 h-11 bg-white normal-case tracking-normal text-slate-950" disabled={loading}>
                    <option value="">Choose classroom</option>
                    {targets.classrooms.map((classroom) => <option key={classroom._id} value={classroom._id}>{classroom.title}</option>)}
                  </select>
                </label>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Last submission date
                  <span className="relative mt-1 block">
                    <CalendarClock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="input h-11 pl-10 normal-case tracking-normal text-slate-950" />
                  </span>
                </label>
              </div>

              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Assign to</div>
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" onClick={() => chooseMode("batches")} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${targetMode === "batches" ? "bg-white text-purple-800 shadow-sm" : "text-slate-500"}`}><Users size={16} /> Batches</button>
                  <button type="button" onClick={() => chooseMode("students")} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${targetMode === "students" ? "bg-white text-purple-800 shadow-sm" : "text-slate-500"}`}><Users size={16} /> Students</button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-200 p-3">
                  <Search size={15} className="text-slate-400" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder={`Search ${targetMode}`} />
                  <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-bold text-purple-700">{selectedIds.length} selected</span>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                  {loading ? <div className="p-5 text-center text-sm text-slate-500">Loading recipients...</div> : availableTargets.map((target) => (
                    <label key={target._id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${selectedIds.includes(target._id) ? "border-purple-300 bg-purple-50" : "border-transparent hover:bg-slate-50"}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-950">{target.name}</span>
                        <span className="block truncate text-xs text-slate-500">{targetMode === "batches" ? `${target.students?.length || 0} students` : target.email || target.username || "Student"}</span>
                      </span>
                      <input type="checkbox" checked={selectedIds.includes(target._id)} onChange={() => toggleTarget(target._id)} className="h-4 w-4 accent-purple-700" />
                    </label>
                  ))}
                  {!loading && !availableTargets.length && <div className="p-5 text-center text-sm text-slate-500">No matching {targetMode} found.</div>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={close} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">Cancel</button>
              <button type="button" onClick={assign} disabled={assigning || loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-purple-700 px-4 text-sm font-black text-white disabled:opacity-50"><Send size={15} /> {assigning ? "Assigning..." : "Assign homework"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm("Permanently delete this assignment template? Existing assigned homework will not be deleted.")) return;
    const response = await fetch(`/api/admin/assignment-templates/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not delete template");
    toast.success("Template deleted");
    router.refresh();
  }

  return (
    <button type="button" onClick={remove} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 text-red-600 hover:bg-red-50" title="Delete template">
      <Trash2 size={15} />
    </button>
  );
}
