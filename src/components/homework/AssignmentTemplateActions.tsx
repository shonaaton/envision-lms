"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Pencil, PlayCircle, Trash2, Upload } from "lucide-react";

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

export function TemplateRowActions({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-1">
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
