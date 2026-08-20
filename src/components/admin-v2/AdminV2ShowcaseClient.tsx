"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Image as ImageIcon, Plus, Save, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Modal, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type Achievement = {
  _id?: string;
  studentName: string;
  achievementImageUrl: string;
  tournamentName: string;
  result: string;
  category: string;
  tournamentLocation: string;
  year: string;
  achievementLevel: "District" | "State" | "National" | "International" | "Rating" | "Other";
  shortDescription?: string;
  isFeatured: boolean;
  isPublished: boolean;
  displayOrder: number;
  sourceImageName?: string;
};

const emptyDraft: Achievement = {
  studentName: "",
  achievementImageUrl: "",
  tournamentName: "",
  result: "",
  category: "Tournament",
  tournamentLocation: "",
  year: String(new Date().getFullYear()),
  achievementLevel: "Other",
  shortDescription: "",
  isFeatured: false,
  isPublished: true,
  displayOrder: 0,
};

export default function AdminV2ShowcaseClient() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [filters, setFilters] = useState({ student: "", tournament: "", year: "" });
  const [draft, setDraft] = useState<Achievement>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.student) params.set("student", filters.student);
    if (filters.tournament) params.set("tournament", filters.tournament);
    if (filters.year) params.set("year", filters.year);
    const response = await fetch(`/api/admin/achievements?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => []);
    if (!response.ok) toast.error("Could not load achievements");
    else setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const students = useMemo(() => Array.from(new Set(items.map((item) => item.studentName).filter(Boolean))).sort(), [items]);
  const tournaments = useMemo(() => Array.from(new Set(items.map((item) => item.tournamentName).filter(Boolean))).sort(), [items]);
  const years = useMemo(() => Array.from(new Set(items.map((item) => item.year).filter(Boolean))).sort().reverse(), [items]);

  async function seed() {
    setSaving(true);
    const response = await fetch("/api/admin/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not import verified data");
    setItems(data);
    toast.success("Verified data imported");
  }

  async function upload(file?: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/admin/achievements/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not upload image");
    setDraft((current) => ({ ...current, achievementImageUrl: data.imageUrl, sourceImageName: data.sourceImageName }));
    setStep(2);
    toast.success("Image uploaded");
  }

  async function save(nextDraft = draft) {
    if (!nextDraft.studentName.trim() || !nextDraft.tournamentName.trim() || !nextDraft.result.trim() || !nextDraft.achievementImageUrl.trim()) {
      return toast.error("Student, tournament, result, and image are required");
    }
    setSaving(true);
    const response = await fetch(nextDraft._id ? `/api/admin/achievements/${nextDraft._id}` : "/api/admin/achievements", {
      method: nextDraft._id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextDraft),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not save achievement");
    toast.success("Achievement saved");
    setOpen(false);
    setDraft(emptyDraft);
    setStep(1);
    await load();
  }

  async function remove(item: Achievement) {
    if (!item._id || !window.confirm(`Delete achievement for ${item.studentName}?`)) return;
    const response = await fetch(`/api/admin/achievements/${item._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete achievement");
    toast.success("Achievement deleted");
    await load();
  }

  async function quickPatch(item: Achievement, patch: Partial<Achievement>) {
    await save({ ...item, ...patch });
  }

  function edit(item?: Achievement) {
    setDraft(item ? { ...emptyDraft, ...item } : emptyDraft);
    setStep(item?.achievementImageUrl ? 2 : 1);
    setOpen(true);
  }

  return (
    <div className="space-y-5">
      <AdminV2Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Showcase</div>
            <h2 className="mt-1 text-2xl font-black text-brand">Achievement Gallery</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AdminV2Stat label="Records" value={items.length} />
            <AdminV2Stat label="Published" value={items.filter((item) => item.isPublished).length} />
            <AdminV2Stat label="Featured" value={items.filter((item) => item.isFeatured).length} tone="accent" />
          </div>
        </div>
        <div className="mt-5 grid gap-2 lg:grid-cols-[1fr_1fr_140px_auto_auto]">
          <select className="input h-11" value={filters.student} onChange={(event) => setFilters((current) => ({ ...current, student: event.target.value }))}>
            <option value="">All students</option>
            {students.map((student) => <option key={student}>{student}</option>)}
          </select>
          <select className="input h-11" value={filters.tournament} onChange={(event) => setFilters((current) => ({ ...current, tournament: event.target.value }))}>
            <option value="">All tournaments</option>
            {tournaments.map((tournament) => <option key={tournament}>{tournament}</option>)}
          </select>
          <select className="input h-11" value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}>
            <option value="">All years</option>
            {years.map((year) => <option key={year}>{year}</option>)}
          </select>
          <button className="btn-outline h-11" onClick={() => void load()}>Apply</button>
          <div className="flex gap-2">
            <button disabled={saving} className="btn-outline h-11" onClick={() => void seed()}><UploadCloud size={16} /> Import</button>
            <button className="btn-primary h-11" onClick={() => edit()}><Plus size={16} /> Add</button>
          </div>
        </div>
      </AdminV2Card>

      <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
        {items.map((item) => (
          <article key={item._id || `${item.studentName}-${item.displayOrder}`} className="group mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button onClick={() => edit(item)} className="relative block aspect-[4/3] w-full bg-slate-100 text-left">
              {item.achievementImageUrl ? <img src={item.achievementImageUrl} alt={`${item.studentName} achievement`} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-slate-400"><ImageIcon size={26} /></span>}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent opacity-95" />
              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <div className="font-black">{item.studentName}</div>
                <div className="mt-1 text-sm text-white/85">{item.result} - {item.tournamentName}</div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-bold">
                  <span className="rounded-full bg-white/15 px-2 py-1">{item.year}</span>
                  <span className="rounded-full bg-white/15 px-2 py-1">{item.tournamentLocation || "Location"}</span>
                  <span className="rounded-full bg-white/15 px-2 py-1">{item.category}</span>
                  <span className="rounded-full bg-white/15 px-2 py-1">{item.achievementLevel}</span>
                </div>
              </div>
            </button>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex gap-2">
                <button title="Mark as featured" onClick={() => void quickPatch(item, { isFeatured: !item.isFeatured })} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border", item.isFeatured ? "border-accent bg-accent text-brand" : "border-slate-200 text-slate-500 hover:text-brand")}><Star size={16} /></button>
                <button title="Publish or hide" onClick={() => void quickPatch(item, { isPublished: !item.isPublished })} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand">{item.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              </div>
              <button title="Delete achievement" onClick={() => void remove(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !items.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No achievements found.</div> : null}

      <AdminV2Modal open={open} title={draft._id ? "Edit Achievement" : "Add Achievement"} description={`Step ${step} of 2`} onClose={() => setOpen(false)} size="lg">
        {step === 1 ? (
          <label className="grid min-h-64 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-brand/20 bg-brand/5 p-8 text-center">
            <span>
              <UploadCloud className="mx-auto text-brand" size={30} />
              <span className="mt-3 block font-black text-brand">Upload achievement image</span>
              <span className="mt-1 block text-sm text-slate-500">JPG, PNG, WEBP, or GIF under 8 MB</span>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
          </label>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" value={draft.studentName} onChange={(event) => setDraft((current) => ({ ...current, studentName: event.target.value }))} placeholder="Student name" />
            <input className="input" value={draft.tournamentName} onChange={(event) => setDraft((current) => ({ ...current, tournamentName: event.target.value }))} placeholder="Tournament" />
            <input className="input" value={draft.result} onChange={(event) => setDraft((current) => ({ ...current, result: event.target.value }))} placeholder="Result" />
            <input className="input" value={draft.year} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value }))} placeholder="Year" />
            <input className="input" value={draft.tournamentLocation} onChange={(event) => setDraft((current) => ({ ...current, tournamentLocation: event.target.value }))} placeholder="Location" />
            <input className="input" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Category" />
            <select className="input" value={draft.achievementLevel} onChange={(event) => setDraft((current) => ({ ...current, achievementLevel: event.target.value as Achievement["achievementLevel"] }))}>
              {["District", "State", "National", "International", "Rating", "Other"].map((level) => <option key={level}>{level}</option>)}
            </select>
            <input className="input" type="number" value={draft.displayOrder} onChange={(event) => setDraft((current) => ({ ...current, displayOrder: Number(event.target.value) }))} placeholder="Display order" />
            <textarea className="input min-h-24 md:col-span-2" value={draft.shortDescription || ""} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} placeholder="Short description" />
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft((current) => ({ ...current, isFeatured: event.target.checked }))} /> Featured</label>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))} /> Published</label>
            </div>
            <button disabled={saving} className="btn-primary justify-self-start md:col-span-2" onClick={() => void save()}><Save size={16} /> Save Achievement</button>
          </div>
        )}
      </AdminV2Modal>
    </div>
  );
}

