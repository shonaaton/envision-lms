"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Trophy,
  UploadCloud,
  X,
} from "lucide-react";
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

type StatusTab = "all" | "published" | "hidden" | "featured";
type SortKey = "order" | "year" | "name";

export const dynamic = "force-dynamic";

/** "Not specified" is what the normalizer stores for a blank field; show nothing for it. */
function shown(value?: string) {
  return value && value !== "Not specified" ? value : "";
}

export default function AdminAchievementsPage() {
  const [items, setItems] = useState<AchievementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusTab>("all");
  const [level, setLevel] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState<SortKey>("order");
  // The form pop-up edits `editing`; null means closed, a record without _id means new.
  const [editing, setEditing] = useState<AchievementRecord | null>(null);
  const [viewingId, setViewingId] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/achievements", { cache: "no-store" });
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

  const years = useMemo(() => Array.from(new Set(items.map((item) => shown(item.year)).filter(Boolean))).sort().reverse(), [items]);
  const counts = useMemo(
    () => ({
      all: items.length,
      published: items.filter((item) => item.isPublished).length,
      hidden: items.filter((item) => !item.isPublished).length,
      featured: items.filter((item) => item.isFeatured).length,
    }),
    [items]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (status === "published" && !item.isPublished) return false;
      if (status === "hidden" && item.isPublished) return false;
      if (status === "featured" && !item.isFeatured) return false;
      if (level && item.achievementLevel !== level) return false;
      if (year && item.year !== year) return false;
      if (!needle) return true;
      return [item.studentName, item.tournamentName, item.result, item.tournamentLocation, item.category, item.shortDescription]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    // "order" keeps the API's order, which is the public site's order (featured, then display order).
    if (sort === "name") return [...filtered].sort((a, b) => a.studentName.localeCompare(b.studentName));
    if (sort === "year") return [...filtered].sort((a, b) => (shown(b.year) || "0").localeCompare(shown(a.year) || "0"));
    return filtered;
  }, [items, query, status, level, year, sort]);

  const viewing = viewingId ? items.find((item) => item._id === viewingId) || null : null;
  const filtersActive = Boolean(query || level || year || status !== "all");

  function clearFilters() {
    setQuery("");
    setLevel("");
    setYear("");
    setStatus("all");
  }

  async function seed() {
    setSeeding(true);
    const response = await fetch("/api/admin/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    const data = await response.json();
    setSeeding(false);
    if (!response.ok) return toast.error(data.error || "Could not import verified achievement data");
    setItems(data);
    toast.success(`Imported ${data.length} verified achievements`);
  }

  function saved(record: AchievementRecord, isNew: boolean) {
    setItems((current) => (isNew ? [record, ...current] : current.map((item) => (item._id === record._id ? record : item))));
    setEditing(null);
    toast.success(isNew ? "Achievement added" : "Achievement updated");
  }

  async function remove(item: AchievementRecord) {
    if (!item._id) return;
    const response = await fetch(`/api/admin/achievements/${item._id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not delete achievement");
    setItems((current) => current.filter((record) => record._id !== item._id));
    setViewingId("");
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
    toast.success(patch.isFeatured !== undefined ? (data.isFeatured ? "Featured on the website" : "Removed from featured") : data.isPublished ? "Now visible on the website" : "Hidden from the website");
  }

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand/70">
              <Trophy size={15} /> Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand">Achievements</h1>
            <p className="mt-1 text-sm text-slate-600">Student wins shown on the website. Click any card to view it, feature it or hide it.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={seed} disabled={seeding} className="btn-outline" title="Re-import the verified achievement spreadsheet">
              {seeding ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} Import verified data
            </button>
            <button type="button" onClick={() => setEditing({ ...emptyDraft })} className="btn-primary">
              <Plus size={16} /> Add achievement
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "All"],
              ["published", "Published"],
              ["hidden", "Hidden"],
              ["featured", "Featured"],
            ] as [StatusTab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold transition",
                  status === key ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand"
                )}
              >
                {label}
                <span className={cn("rounded-full px-1.5 text-xs", status === key ? "bg-white/20" : "bg-white text-slate-500")}>{counts[key]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, tournament, result or place" className="input h-10 !pl-9" />
            </div>
            <div className="grid grid-cols-3 gap-2 md:flex">
              <select value={level} onChange={(event) => setLevel(event.target.value)} className="input h-10 md:w-36">
                <option value="">All levels</option>
                {levels.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select value={year} onChange={(event) => setYear(event.target.value)} className="input h-10 md:w-32">
                <option value="">All years</option>
                {years.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="input h-10 md:w-40" aria-label="Sort">
                <option value="order">Website order</option>
                <option value="year">Newest year</option>
                <option value="name">Student A–Z</option>
              </select>
            </div>
            <div className="flex shrink-0 rounded-lg border border-slate-200 p-0.5">
              <button type="button" onClick={() => setView("grid")} aria-label="Grid view" className={cn("grid h-9 w-9 place-items-center rounded-md transition", view === "grid" ? "bg-brand text-white" : "text-slate-500 hover:text-brand")}>
                <LayoutGrid size={16} />
              </button>
              <button type="button" onClick={() => setView("list")} aria-label="List view" className={cn("grid h-9 w-9 place-items-center rounded-md transition", view === "list" ? "bg-brand text-white" : "text-slate-500 hover:text-brand")}>
                <List size={16} />
              </button>
            </div>
          </div>

          {filtersActive && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Showing {visible.length} of {items.length}
              <button type="button" onClick={clearFilters} className="font-bold text-brand hover:underline">
                Clear filters
              </button>
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-xl border border-slate-100">
                  <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No achievements yet"
              text="Add your first student achievement, or import the verified spreadsheet data."
              action={
                <button type="button" onClick={() => setEditing({ ...emptyDraft })} className="btn-primary">
                  <Plus size={16} /> Add achievement
                </button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nothing matches"
              text="Try a different search or clear the filters."
              action={
                <button type="button" onClick={clearFilters} className="btn-outline">
                  Clear filters
                </button>
              }
            />
          ) : view === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((item) => (
                <AchievementCard key={item._id} item={item} onOpen={() => setViewingId(item._id || "")} onEdit={() => setEditing({ ...emptyDraft, ...item })} onPatch={(patch) => quickPatch(item, patch)} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {visible.map((item) => (
                <AchievementRow key={item._id} item={item} onOpen={() => setViewingId(item._id || "")} onEdit={() => setEditing({ ...emptyDraft, ...item })} onPatch={(patch) => quickPatch(item, patch)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {viewing && (
        <ViewDialog
          item={viewing}
          onClose={() => setViewingId("")}
          onEdit={() => {
            setEditing({ ...emptyDraft, ...viewing });
            setViewingId("");
          }}
          onPatch={(patch) => quickPatch(viewing, patch)}
          onDelete={() => remove(viewing)}
        />
      )}

      {editing && <EditDialog initial={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  );
}

function AchievementCard({ item, onOpen, onEdit, onPatch }: { item: AchievementRecord; onOpen: () => void; onEdit: () => void; onPatch: (patch: Partial<AchievementRecord>) => void }) {
  return (
    <article className={cn("group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg", item.isPublished ? "border-slate-200" : "border-dashed border-slate-300")}>
      <button type="button" onClick={onOpen} className="relative block aspect-[4/3] overflow-hidden bg-slate-100 text-left">
        {item.achievementImageUrl ? (
          <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className={cn("object-cover transition duration-500 group-hover:scale-105", !item.isPublished && "opacity-60 grayscale")} />
        ) : (
          <span className="grid h-full place-items-center text-slate-400"><ImageIcon size={28} /></span>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <LevelBadge level={item.achievementLevel} />
          {item.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-black text-brand-900 shadow"><Star size={11} className="fill-current" /> Featured</span>}
        </div>
        {!item.isPublished && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-bold text-white"><EyeOff size={11} /> Hidden</span>}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="truncate font-black text-slate-950">{item.studentName}</h3>
          <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-brand">{item.result}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.tournamentName}</p>
        </button>
        <Meta item={item} className="mt-2" />
        <div className="mt-auto flex items-center gap-1 border-t border-slate-100 pt-2">
          <IconButton label={item.isFeatured ? "Unfeature" : "Feature"} active={item.isFeatured} onClick={() => onPatch({ isFeatured: !item.isFeatured })}>
            <Star size={15} className={cn(item.isFeatured && "fill-current")} />
          </IconButton>
          <IconButton label={item.isPublished ? "Hide from website" : "Publish"} onClick={() => onPatch({ isPublished: !item.isPublished })}>
            {item.isPublished ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconButton>
          <button type="button" onClick={onEdit} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand-50">
            <Pencil size={13} /> Edit
          </button>
        </div>
      </div>
    </article>
  );
}

function AchievementRow({ item, onOpen, onEdit, onPatch }: { item: AchievementRecord; onOpen: () => void; onEdit: () => void; onPatch: (patch: Partial<AchievementRecord>) => void }) {
  return (
    <div className="flex items-center gap-3 bg-white p-2.5 transition hover:bg-slate-50">
      <button type="button" onClick={onOpen} className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {item.achievementImageUrl ? (
          <Image src={item.achievementImageUrl} alt="" fill sizes="64px" className={cn("object-cover", !item.isPublished && "opacity-60 grayscale")} />
        ) : (
          <span className="grid h-full place-items-center text-slate-400"><ImageIcon size={18} /></span>
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate font-black text-slate-950">{item.studentName}</span>
          {item.isFeatured && <Star size={13} className="shrink-0 fill-accent text-accent-600" />}
          {!item.isPublished && <span className="shrink-0 rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-500">Hidden</span>}
        </div>
        <div className="truncate text-sm text-slate-600">
          <span className="font-semibold text-brand">{item.result}</span> · {item.tournamentName}
        </div>
      </button>
      <div className="hidden w-56 shrink-0 lg:block">
        <Meta item={item} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label={item.isFeatured ? "Unfeature" : "Feature"} active={item.isFeatured} onClick={() => onPatch({ isFeatured: !item.isFeatured })}>
          <Star size={15} className={cn(item.isFeatured && "fill-current")} />
        </IconButton>
        <IconButton label={item.isPublished ? "Hide from website" : "Publish"} onClick={() => onPatch({ isPublished: !item.isPublished })}>
          {item.isPublished ? <Eye size={15} /> : <EyeOff size={15} />}
        </IconButton>
        <IconButton label="Edit" onClick={onEdit}>
          <Pencil size={15} />
        </IconButton>
      </div>
    </div>
  );
}

function ViewDialog({ item, onClose, onEdit, onPatch, onDelete }: { item: AchievementRecord; onClose: () => void; onEdit: () => void; onPatch: (patch: Partial<AchievementRecord>) => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Dialog onClose={onClose} label={`${item.studentName} achievement`}>
      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative min-h-64 bg-slate-950 md:min-h-[480px]">
          {item.achievementImageUrl ? (
            <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 768px) 560px, 100vw" className="object-contain" />
          ) : (
            <span className="grid h-full place-items-center text-slate-500"><ImageIcon size={36} /></span>
          )}
        </div>

        <div className="flex flex-col p-5">
          <div className="flex flex-wrap gap-1.5">
            <LevelBadge level={item.achievementLevel} />
            {item.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-black text-brand-900"><Star size={11} className="fill-current" /> Featured</span>}
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", item.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
              {item.isPublished ? <Eye size={11} /> : <EyeOff size={11} />} {item.isPublished ? "Published" : "Hidden"}
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-black text-slate-950">{item.studentName}</h2>
          <p className="mt-1 text-lg font-bold text-brand">{item.result}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{item.tournamentName}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <Detail label="Year" value={shown(item.year) || "—"} />
            <Detail label="Location" value={shown(item.tournamentLocation) || "—"} />
            <Detail label="Category" value={item.category || "—"} />
            <Detail label="Display order" value={String(item.displayOrder)} />
          </dl>

          {item.shortDescription && <p className="mt-4 text-sm leading-6 text-slate-600">{item.shortDescription}</p>}

          <div className="mt-auto space-y-2 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onPatch({ isFeatured: !item.isFeatured })} className="btn-outline">
                <Star size={15} className={cn(item.isFeatured && "fill-current")} /> {item.isFeatured ? "Unfeature" : "Feature"}
              </button>
              <button type="button" onClick={() => onPatch({ isPublished: !item.isPublished })} className="btn-outline">
                {item.isPublished ? <EyeOff size={15} /> : <Eye size={15} />} {item.isPublished ? "Hide" : "Publish"}
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onEdit} className="btn-primary flex-1">
                <Pencil size={15} /> Edit details
              </button>
              {confirmDelete ? (
                <button type="button" onClick={onDelete} className="btn bg-red-600 text-white hover:bg-red-700">
                  Confirm delete
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete achievement" className="btn border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function EditDialog({ initial, onClose, onSaved }: { initial: AchievementRecord; onClose: () => void; onSaved: (record: AchievementRecord, isNew: boolean) => void }) {
  const isNew = !initial._id;
  const [draft, setDraft] = useState<AchievementRecord>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof AchievementRecord>(key: K, value: AchievementRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function uploadImage(file?: File | null) {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/admin/achievements/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) return toast.error(data.error || "Could not upload image");
    setDraft((current) => ({ ...current, achievementImageUrl: data.imageUrl, sourceImageName: data.sourceImageName }));
  }

  async function save() {
    if (!draft.achievementImageUrl.trim()) return toast.error("Add an achievement photo first");
    if (!draft.studentName.trim()) return toast.error("Student name is required");
    if (!draft.result.trim()) return toast.error("Result is required");
    if (!draft.tournamentName.trim()) return toast.error("Tournament name is required");

    setSaving(true);
    const response = await fetch(isNew ? "/api/admin/achievements" : `/api/admin/achievements/${initial._id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not save achievement");
    onSaved(data, isNew);
  }

  return (
    <Dialog onClose={onClose} label={isNew ? "Add achievement" : "Edit achievement"} busy={saving || uploading}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">{isNew ? "Add achievement" : "Edit achievement"}</h2>
          <p className="text-xs text-slate-500">{isNew ? "Upload the photo, fill in the win, and save." : draft.studentName}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              uploadImage(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "group relative grid aspect-[4/5] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed transition",
              dragging ? "border-brand bg-brand-50" : draft.achievementImageUrl ? "border-transparent bg-slate-100" : "border-brand/25 bg-brand-50/50 hover:border-brand/50"
            )}
          >
            {draft.achievementImageUrl ? (
              <>
                <Image src={draft.achievementImageUrl} alt="Achievement photo" fill sizes="300px" className="object-cover" />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-slate-950/70 py-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                  <UploadCloud size={14} /> Replace photo
                </span>
              </>
            ) : (
              <div className="px-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-brand shadow-sm">
                  <UploadCloud size={22} />
                </span>
                <p className="mt-3 text-sm font-bold text-brand">Drop photo here</p>
                <p className="mt-1 text-xs text-slate-500">or click to choose · JPG, PNG, WEBP up to 8 MB</p>
              </div>
            )}
            {uploading && (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 size={26} className="animate-spin text-brand" />
              </span>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => {
            uploadImage(event.target.files?.[0]);
            event.target.value = "";
          }} />

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <Switch label="Show on website" hint="Hidden wins stay here only" checked={draft.isPublished} onChange={(value) => set("isPublished", value)} />
            <Switch label="Feature on homepage" hint="Pinned to the top of the showcase" checked={draft.isFeatured} onChange={(value) => set("isFeatured", value)} />
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Student name" required>
            <input value={draft.studentName} onChange={(event) => set("studentName", event.target.value)} className="input h-10" placeholder="e.g. Aarav Sen" autoFocus />
          </Field>
          <Field label="Result / position" required>
            <input value={draft.result} onChange={(event) => set("result", event.target.value)} className="input h-10" placeholder="e.g. 1st place, U-10 category" />
          </Field>
          <Field label="Tournament" required>
            <input value={draft.tournamentName} onChange={(event) => set("tournamentName", event.target.value)} className="input h-10" placeholder="e.g. West Bengal State Chess Championship" />
          </Field>

          <Field label="Level">
            <div className="flex flex-wrap gap-1.5">
              {levels.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => set("achievementLevel", option)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition", draft.achievementLevel === option ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:ring-brand/40")}
                >
                  {option}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Year">
              <input value={shown(draft.year)} onChange={(event) => set("year", event.target.value)} className="input h-10" placeholder="2026" inputMode="numeric" />
            </Field>
            <Field label="Location">
              <input value={shown(draft.tournamentLocation)} onChange={(event) => set("tournamentLocation", event.target.value)} className="input h-10" placeholder="Kolkata" />
            </Field>
            <Field label="Category">
              <input value={draft.category} onChange={(event) => set("category", event.target.value)} className="input h-10" placeholder="Tournament" />
            </Field>
          </div>

          <Field label="Short description" hint="Leave blank and it is written for you from the name, result and tournament.">
            <textarea value={draft.shortDescription} onChange={(event) => set("shortDescription", event.target.value)} rows={3} className="input" />
          </Field>

          <button type="button" onClick={() => setShowAdvanced((current) => !current)} className="text-xs font-bold text-brand hover:underline">
            {showAdvanced ? "Hide advanced settings" : "Advanced settings (display order, image URLs)"}
          </button>
          {showAdvanced && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <Field label="Display order" hint="Lower numbers show first on the website.">
                <input value={String(draft.displayOrder)} onChange={(event) => set("displayOrder", Number(event.target.value) || 0)} type="number" className="input h-10 sm:w-32" />
              </Field>
              <Field label="Achievement image URL">
                <input value={draft.achievementImageUrl} onChange={(event) => set("achievementImageUrl", event.target.value)} className="input h-10" />
              </Field>
              <Field label="Student photo URL">
                <input value={draft.studentPhotoUrl || ""} onChange={(event) => set("studentPhotoUrl", event.target.value)} className="input h-10" />
              </Field>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving || uploading} className="btn-primary min-w-32">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? "Saving..." : isNew ? "Add achievement" : "Save changes"}
        </button>
      </div>
    </Dialog>
  );
}

/** Wider than common/Modal and full-bleed, so the photo can sit edge to edge. */
function Dialog({ onClose, label, busy, children }: { onClose: () => void; label: string; busy?: boolean; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="relative my-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" onClick={onClose} disabled={busy} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-600 shadow hover:bg-white hover:text-slate-950 disabled:opacity-50" aria-label="Close">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{hint}</span>}
    </label>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Meta({ item, className }: { item: AchievementRecord; className?: string }) {
  const year = shown(item.year);
  const place = shown(item.tournamentLocation);
  if (!year && !place) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500", className)}>
      {year && <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {year}</span>}
      {place && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0" /> <span className="truncate">{place}</span></span>}
    </div>
  );
}

const levelTone: Record<AchievementLevel, string> = {
  International: "bg-violet-600 text-white",
  National: "bg-brand text-white",
  State: "bg-sky-600 text-white",
  District: "bg-emerald-600 text-white",
  Rating: "bg-amber-500 text-white",
  Other: "bg-slate-700 text-white",
};

function LevelBadge({ level }: { level: AchievementLevel }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black shadow", levelTone[level] || levelTone.Other)}>{level}</span>;
}

function IconButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cn("grid h-8 w-8 place-items-center rounded-lg transition", active ? "bg-accent/30 text-brand" : "text-slate-500 hover:bg-slate-100 hover:text-brand")}>
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand">
        <Trophy size={24} />
      </span>
      <h3 className="mt-3 font-black text-slate-950">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}
