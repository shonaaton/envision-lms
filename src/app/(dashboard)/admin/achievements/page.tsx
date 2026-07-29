"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Filter, Image as ImageIcon, Plus, Save, Search, Star, Trash2, Trophy, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AchievementRecord, AchievementLevel } from "@/lib/achievementData";

const levels: AchievementLevel[] = ["District", "State", "National", "International", "Rating", "Other"];

const emptyDraft: AchievementRecord = {
  studentName: "",
  studentPhotoUrl: "",
  achievementImageUrl: "",
  tournamentName: "",
  result: "",
  category: "Tournament",
  tournamentLocation: "",
  year: "",
  achievementLevel: "Other",
  shortDescription: "",
  isFeatured: false,
  displayOrder: 0,
  isPublished: true,
  sourceImageName: "",
};

export const dynamic = "force-dynamic";

export default function AdminAchievementsPage() {
  const [items, setItems] = useState<AchievementRecord[]>([]);
  const [draft, setDraft] = useState<AchievementRecord>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ q: "", student: "", tournament: "", result: "", year: "", location: "", category: "", level: "", visibility: "" });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    const response = await fetch(`/api/admin/achievements?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      toast.error("Could not load achievements");
      setLoading(false);
      return;
    }
    setItems(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(), [items]);
  const years = useMemo(() => Array.from(new Set(items.map((item) => item.year).filter((year) => year && year !== "Not specified"))).sort().reverse(), [items]);
  const featuredCount = items.filter((item) => item.isFeatured).length;
  const publishedCount = items.filter((item) => item.isPublished).length;

  function edit(item: AchievementRecord) {
    setEditingId(item._id || "");
    setDraft({ ...emptyDraft, ...item });
  }

  function reset() {
    setEditingId("");
    setDraft(emptyDraft);
  }

  async function seed() {
    setSaving(true);
    const response = await fetch("/api/admin/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not import verified achievement data");
    setItems(data);
    toast.success(`Imported ${data.length} verified achievements`);
  }

  async function uploadImage(file?: File | null) {
    if (!file) return;
    setSaving(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/admin/achievements/upload", { method: "POST", body: form });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not upload image");
    setDraft((current) => ({ ...current, achievementImageUrl: data.imageUrl, sourceImageName: data.sourceImageName }));
    toast.success("Image uploaded and matched to this record");
  }

  async function save() {
    if (!draft.studentName.trim()) return toast.error("Student name is required");
    if (!draft.tournamentName.trim()) return toast.error("Tournament name is required");
    if (!draft.result.trim()) return toast.error("Result is required");
    if (!draft.achievementImageUrl.trim()) return toast.error("Achievement image is required");

    setSaving(true);
    const response = await fetch(editingId ? `/api/admin/achievements/${editingId}` : "/api/admin/achievements", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not save achievement");

    setItems((current) => {
      if (editingId) return current.map((item) => (item._id === data._id ? data : item));
      return [data, ...current];
    });
    edit(data);
    toast.success("Achievement saved");
  }

  async function remove(item: AchievementRecord) {
    if (!item._id) return;
    const confirmed = window.confirm(`Delete achievement for ${item.studentName}?`);
    if (!confirmed) return;

    const response = await fetch(`/api/admin/achievements/${item._id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not delete achievement");
    setItems((current) => current.filter((record) => record._id !== item._id));
    if (editingId === item._id) reset();
    toast.success("Achievement deleted");
  }

  async function quickPatch(item: AchievementRecord, patch: Partial<AchievementRecord>) {
    if (!item._id) return;
    const response = await fetch(`/api/admin/achievements/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, ...patch }),
    });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Could not update achievement");
    setItems((current) => current.map((record) => (record._id === data._id ? data : record)));
    if (editingId === data._id) setDraft(data);
  }

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand/70">
              <Trophy size={15} /> Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand">Achievement Management</h1>
            <p className="mt-1 text-sm text-slate-600">Control student achievements, images, homepage featuring, visibility, and display order.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Records" value={items.length} />
            <Stat label="Published" value={publishedCount} />
            <Stat label="Featured" value={featuredCount} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="font-black text-slate-950">Verified Achievement Records</h2>
                <p className="text-xs text-slate-500">Imported from the achievement spreadsheet and matched to local images.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={seed} disabled={saving} className="btn-accent">
                  <UploadCloud size={16} /> Import Verified Data
                </button>
                <button type="button" onClick={reset} className="btn-primary">
                  <Plus size={16} /> Add Achievement
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-4 2xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_0.7fr_0.8fr_0.8fr_0.8fr_0.7fr]">
              <FilterInput icon={Search} value={filters.q} onChange={(q) => setFilters((current) => ({ ...current, q }))} placeholder="Search all" />
              <FilterInput icon={Search} value={filters.student} onChange={(student) => setFilters((current) => ({ ...current, student }))} placeholder="Student" />
              <FilterInput icon={Search} value={filters.tournament} onChange={(tournament) => setFilters((current) => ({ ...current, tournament }))} placeholder="Tournament" />
              <FilterInput icon={Search} value={filters.result} onChange={(result) => setFilters((current) => ({ ...current, result }))} placeholder="Result" />
              <FilterInput icon={Search} value={filters.location} onChange={(location) => setFilters((current) => ({ ...current, location }))} placeholder="Location" />
              <select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))} className="input h-10">
                <option value="">Year</option>
                {years.map((year) => <option key={year}>{year}</option>)}
              </select>
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className="input h-10">
                <option value="">Category</option>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
              <select value={filters.level} onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))} className="input h-10">
                <option value="">Level</option>
                {levels.map((level) => <option key={level}>{level}</option>)}
              </select>
              <select value={filters.visibility} onChange={(event) => setFilters((current) => ({ ...current, visibility: event.target.value }))} className="input h-10">
                <option value="">Visibility</option>
                <option value="published">Published</option>
                <option value="hidden">Hidden</option>
              </select>
              <button type="button" onClick={load} className="btn-outline h-10">
                <Filter size={15} /> Apply
              </button>
            </div>
          </div>

          <div className="grid divide-y divide-slate-100">
            {loading && <div className="p-8 text-sm text-slate-500">Loading achievements...</div>}
            {!loading && items.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No achievements found. Import verified data to begin.</div>}
            {items.map((item) => (
              <article key={item._id || `${item.studentName}-${item.displayOrder}`} className={cn("grid gap-4 p-4 transition hover:bg-slate-50/80 lg:grid-cols-[120px_minmax(0,1fr)_220px]", editingId === item._id && "bg-brand/[0.03]")}>
                <button type="button" onClick={() => edit(item)} className="relative aspect-[1.16] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {item.achievementImageUrl ? (
                    <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="120px" className="object-cover transition duration-300 hover:scale-105" />
                  ) : (
                    <span className="grid h-full place-items-center text-slate-400"><ImageIcon size={22} /></span>
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-black text-slate-950">{item.studentName}</h3>
                    {item.isFeatured && <Pill tone="gold"><Star size={12} /> Featured</Pill>}
                    <Pill tone={item.isPublished ? "green" : "gray"}>{item.isPublished ? "Published" : "Hidden"}</Pill>
                  </div>
                  <p className="mt-1 font-semibold text-slate-800">{item.result}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{item.tournamentName}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="chip">{item.achievementLevel}</span>
                    <span className="chip">{item.category}</span>
                    <span className="chip bg-white">{item.tournamentLocation}</span>
                    <span className="chip bg-white">{item.year}</span>
                    <span className="chip-accent">Order {item.displayOrder}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  <button type="button" onClick={() => quickPatch(item, { isFeatured: !item.isFeatured })} className="btn-outline h-9">
                    <Star size={15} /> {item.isFeatured ? "Unfeature" : "Feature"}
                  </button>
                  <button type="button" onClick={() => quickPatch(item, { isPublished: !item.isPublished })} className="btn-outline h-9">
                    {item.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}
                    {item.isPublished ? "Hide" : "Publish"}
                  </button>
                  <button type="button" onClick={() => edit(item)} className="btn-primary h-9">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(item)} className="btn h-9 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-brand">{editingId ? "Edit Achievement" : "Add Achievement"}</h2>
              <p className="mt-1 text-xs text-slate-500">Use Cloudinary URLs or local image paths from the copied achievement folder.</p>
            </div>
            <Pill tone={draft.isPublished ? "green" : "gray"}>{draft.isPublished ? "Published" : "Hidden"}</Pill>
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Student Name" value={draft.studentName} onChange={(studentName) => setDraft((current) => ({ ...current, studentName }))} />
            <Field label="Tournament Name" value={draft.tournamentName} onChange={(tournamentName) => setDraft((current) => ({ ...current, tournamentName }))} />
            <Field label="Result / Position" value={draft.result} onChange={(result) => setDraft((current) => ({ ...current, result }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Year" value={draft.year} onChange={(year) => setDraft((current) => ({ ...current, year }))} />
              <Field label="Display Order" value={String(draft.displayOrder)} type="number" onChange={(displayOrder) => setDraft((current) => ({ ...current, displayOrder: Number(displayOrder) }))} />
            </div>
            <Field label="Location" value={draft.tournamentLocation} onChange={(tournamentLocation) => setDraft((current) => ({ ...current, tournamentLocation }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" value={draft.category} onChange={(category) => setDraft((current) => ({ ...current, category }))} />
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Level</span>
                <select value={draft.achievementLevel} onChange={(event) => setDraft((current) => ({ ...current, achievementLevel: event.target.value as AchievementLevel }))} className="input mt-1 h-10">
                  {levels.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
            </div>
            <Field label="Achievement Image URL" value={draft.achievementImageUrl} onChange={(achievementImageUrl) => setDraft((current) => ({ ...current, achievementImageUrl }))} />
            <label className="block rounded-lg border border-dashed border-brand/25 bg-brand-50 p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-brand">Upload New Achievement Image</span>
              <input type="file" accept="image/*" onChange={(event) => uploadImage(event.target.files?.[0])} className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" />
              <span className="mt-2 block text-xs leading-5 text-slate-500">The uploaded image will be matched to this record and can replace the current achievement image.</span>
            </label>
            <Field label="Student Photo URL" value={draft.studentPhotoUrl || ""} onChange={(studentPhotoUrl) => setDraft((current) => ({ ...current, studentPhotoUrl }))} />
            <Field label="Source Image Name" value={draft.sourceImageName} onChange={(sourceImageName) => setDraft((current) => ({ ...current, sourceImageName }))} />
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Short Description</span>
              <textarea value={draft.shortDescription} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} rows={4} className="input mt-1" />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle active={draft.isFeatured} onClick={() => setDraft((current) => ({ ...current, isFeatured: !current.isFeatured }))} label="Featured" />
              <Toggle active={draft.isPublished} onClick={() => setDraft((current) => ({ ...current, isPublished: !current.isPublished }))} label="Public Visibility" />
            </div>
            {draft.achievementImageUrl && (
              <div className="relative aspect-[1.18] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <Image src={draft.achievementImageUrl} alt="Achievement preview" fill sizes="420px" className="object-cover" />
              </div>
            )}
            <button type="button" onClick={save} disabled={saving} className="btn-primary h-11 w-full">
              <Save size={16} /> {saving ? "Saving..." : "Save Achievement"}
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} className="input mt-1 h-10" />
    </label>
  );
}

function FilterInput({ icon: Icon, value, onChange, placeholder }: { icon: any; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input h-10 pl-9" />
    </div>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-10 items-center justify-between rounded-lg border px-3 text-sm font-bold transition", active ? "border-brand bg-brand text-white" : "border-slate-200 bg-slate-50 text-slate-600")}>
      {label}
      <span className={cn("grid h-5 w-5 place-items-center rounded-full", active ? "bg-accent text-brand" : "bg-slate-200 text-slate-500")}>{active && <Check size={13} />}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "gold" | "green" | "gray" }) {
  const className = {
    gold: "bg-accent/30 text-brand ring-accent/50",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    gray: "bg-slate-100 text-slate-600 ring-slate-200",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1", className)}>{children}</span>;
}
