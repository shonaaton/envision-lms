"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AddBatchModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/users?role=instructor").then((r) => r.json()).then(setCoaches);
    fetch("/api/admin/users?role=student").then((r) => r.json()).then(setStudents);
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      description: fd.get("description") || undefined,
      coach: fd.get("coach") || undefined,
      level: fd.get("level"),
      tags: (fd.get("tags") as string || "").split(",").map((s) => s.trim()).filter(Boolean),
      students: selectedStudents,
    };
    const res = await fetch("/api/admin/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      return toast.error(d.error || "Failed");
    }
    toast.success("Batch created");
    onCreated();
    onClose();
  }

  function toggle(id: string) {
    setSelectedStudents((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-semibold text-white">Add Batch</h2>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" name="name" placeholder="Batch name (e.g. Sunday Morning A)" required />
          <textarea className="input min-h-[60px]" name="description" placeholder="Description" />
          <div className="grid grid-cols-2 gap-3">
            <select className="input" name="coach" defaultValue="">
              <option value="">No coach yet</option>
              {coaches.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select className="input" name="level" defaultValue="beginner">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <input className="input" name="tags" placeholder="Tags (comma separated)" />
          <div>
            <div className="mb-1 text-xs uppercase text-gray-400">Students ({selectedStudents.length} selected)</div>
            <div className="max-h-48 overflow-y-auto rounded border border-ink-700 p-2 text-sm">
              {students.map((s) => (
                <label key={s._id} className="flex items-center gap-2 py-1">
                  <input type="checkbox" checked={selectedStudents.includes(s._id)} onChange={() => toggle(s._id)} />
                  <span className="text-white">{s.name}</span>
                  <span className="text-gray-500">— {s.email}</span>
                </label>
              ))}
              {students.length === 0 && <div className="text-gray-500">No students yet.</div>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={loading}>{loading ? "Creating..." : "Create Batch"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
