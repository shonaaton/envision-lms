"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderInput, X } from "lucide-react";
import { TemplateRowActions } from "@/components/homework/AssignmentTemplateActions";

export type TemplateRow = {
  id: string;
  title: string;
  subtitle: string;
  courseName: string;
  levelName: string;
  topicName: string;
  activities: string;
  linkStatus: string;
  duePolicy: string;
};

export type MoveCourse = { id: string; name: string; levels: string[] };

const OTHER_LEVEL = "__other__";

function badgeClass(status: string) {
  if (status === "linked" || status === "assigned") return "bg-emerald-50 text-emerald-700";
  if (status === "needs_review" || status === "ambiguous_template") return "bg-amber-50 text-amber-700";
  if (status.includes("missing") || status.includes("skipped") || status === "unlinked") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default function TemplateBulkMove({ rows, courses, canMove }: { rows: TemplateRow[]; courses: MoveCourse[]; canMove: boolean }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [levelChoice, setLevelChoice] = useState("");
  const [customLevel, setCustomLevel] = useState("");

  const selectedOnPage = useMemo(() => selectedIds.filter((id) => rows.some((row) => row.id === id)), [rows, selectedIds]);
  const allSelected = rows.length > 0 && selectedOnPage.length === rows.length;
  const selectedCourse = courses.find((course) => course.id === courseId);
  const levelName = levelChoice === OTHER_LEVEL ? customLevel.trim() : levelChoice;

  function toggleRow(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelectedIds((current) => {
      const pageIds = rows.map((row) => row.id);
      const offPage = current.filter((id) => !pageIds.includes(id));
      return allSelected ? offPage : [...offPage, ...pageIds];
    });
  }

  function chooseCourse(nextCourseId: string) {
    setCourseId(nextCourseId);
    setLevelChoice("");
    setCustomLevel("");
  }

  function close() {
    if (moving) return;
    setOpen(false);
  }

  async function move() {
    if (!courseId) return toast.error("Choose the course to move these templates into");
    if (!levelName) return toast.error("Choose or type the level to move these templates into");

    setMoving(true);
    const response = await fetch("/api/admin/assignment-templates/bulk-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, course: courseId, levelName }),
    });
    const data = await response.json().catch(() => ({}));
    setMoving(false);
    if (!response.ok) return toast.error(data.error || "Could not move these templates");

    const summary = `Moved ${data.moved} template${data.moved === 1 ? "" : "s"} to ${data.courseName} - ${data.levelName}.`;
    if (!data.levelExists) {
      toast.warning(`${summary} No level by that name exists on the course yet, so all of them are marked needs review.`, { duration: 9000 });
    } else if (data.needsReview) {
      toast.success(`${summary} ${data.linked} linked, ${data.needsReview} need review - their topic is not on that level.`, { duration: 9000 });
    } else {
      toast.success(`${summary} All ${data.linked} linked to a topic on that level.`, { duration: 6000 });
    }
    setOpen(false);
    setSelectedIds([]);
    router.refresh();
  }

  return (
    <>
      {canMove && selectedIds.length > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-brand/20 bg-brand/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-bold text-slate-950">
            {selectedIds.length} template{selectedIds.length === 1 ? "" : "s"} selected
            {selectedIds.length > selectedOnPage.length && <span className="font-semibold text-slate-500"> ({selectedOnPage.length} on this page)</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedIds([])} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">Clear selection</button>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white"><FolderInput size={15} /> Move to course &amp; level</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b border-slate-100">
              {canMove && (
                <th className="px-3 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand" aria-label="Select every template on this page" />
                </th>
              )}
              <th className="px-3 py-3">Template</th>
              <th className="px-3 py-3">Course / Level</th>
              <th className="px-3 py-3">Topic</th>
              <th className="px-3 py-3">Activities</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Due Policy</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={`border-b border-slate-100 last:border-0 ${selectedIds.includes(row.id) ? "bg-brand/5" : ""}`}>
                {canMove && (
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} className="h-4 w-4 accent-brand" aria-label={`Select ${row.title}`} />
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-950">{row.title}</div>
                  <div className="text-xs text-slate-500">{row.subtitle}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{row.courseName || "-"}</div>
                  <div className="text-xs text-slate-500">{row.levelName || "-"}</div>
                </td>
                <td className="px-3 py-3">{row.topicName}</td>
                <td className="px-3 py-3">{row.activities}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(row.linkStatus)}`}>{row.linkStatus}</span>
                </td>
                <td className="px-3 py-3">{row.duePolicy}</td>
                <td className="px-3 py-3"><TemplateRowActions id={row.id} title={row.title} /></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={canMove ? 8 : 7} className="px-3 py-8 text-center text-sm text-slate-500">No templates found. Clear the filters, or upload a JSON template.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" onMouseDown={close}>
          <div role="dialog" aria-modal="true" aria-labelledby="move-templates-title" className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Re-file templates</div>
                <h3 id="move-templates-title" className="mt-1 text-xl font-black text-slate-950">Move {selectedIds.length} template{selectedIds.length === 1 ? "" : "s"}</h3>
                <p className="mt-1 text-sm text-slate-500">Sets the course and level on every selected template. Their activities, topics and due policy are untouched.</p>
              </div>
              <button type="button" onClick={close} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-600" aria-label="Close move window"><X size={16} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                New course
                <select value={courseId} onChange={(event) => chooseCourse(event.target.value)} className="input mt-1 h-11 bg-white normal-case tracking-normal text-slate-950">
                  <option value="">Choose course</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>

              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                New level
                <select value={levelChoice} onChange={(event) => setLevelChoice(event.target.value)} disabled={!courseId} className="input mt-1 h-11 bg-white normal-case tracking-normal text-slate-950 disabled:opacity-50">
                  <option value="">{courseId ? "Choose level" : "Choose a course first"}</option>
                  {(selectedCourse?.levels || []).map((level) => <option key={level} value={level}>{level}</option>)}
                  <option value={OTHER_LEVEL}>Other - type a level name</option>
                </select>
              </label>

              {levelChoice === OTHER_LEVEL && (
                <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                  Level name
                  <input value={customLevel} onChange={(event) => setCustomLevel(event.target.value)} placeholder="Semi Pro Level 1" className="input mt-1 h-11 normal-case tracking-normal text-slate-950" />
                  <span className="mt-1 block font-semibold normal-case tracking-normal text-amber-700">
                    A level that does not exist on the course yet will move the templates but leave them all as needs review.
                  </span>
                </label>
              )}

              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Auto-assignment matches a template to a class on these two names. Classes already running under the old course and level will stop matching these templates until the classes are moved too.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={close} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">Cancel</button>
              <button type="button" onClick={move} disabled={moving || !courseId || !levelName} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white disabled:opacity-50">
                <FolderInput size={15} /> {moving ? "Moving..." : "Move templates"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
