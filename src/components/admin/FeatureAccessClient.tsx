"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, CopyCheck, Filter, History, Layers3, Lock, Plus, RotateCcw, Save, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TestTube2, Users, X } from "lucide-react";
import { FEATURE_CATEGORIES, FEATURE_DEFINITIONS, PORTAL_ROLES, type FeatureStatus, type PortalRole } from "@/lib/featureRegistry";
import { cn } from "@/lib/utils";

type FeatureRow = (typeof FEATURE_DEFINITIONS)[number] & {
  status: FeatureStatus;
  rolePermissions: Record<PortalRole, string[]>;
  pilotRoles: PortalRole[];
  pilotUsers: string[];
  pilotBatches: string[];
  pilotCourses: string[];
  userOverrides: Array<{ user: string; access: "role_default" | "allow" | "deny"; permissions: string[]; expiresAt?: string; note?: string }>;
  releaseNote?: string;
};

type Lookup = { _id: string; name?: string; email?: string; username?: string; role?: string; level?: string; category?: string };
type AuditItem = { _id: string; featureLabel: string; targetType: string; reason?: string; targetLabel?: string; actor?: { name?: string; email?: string; username?: string }; createdAt: string };
type TemplateItem = { _id: string; name: string; description?: string; role: PortalRole; permissions?: Record<string, string[]> };
type ApiData = { features: FeatureRow[]; users: Lookup[]; batches: Lookup[]; courses: Lookup[]; audit: AuditItem[]; templates: TemplateItem[] };

const statusLabels: Record<FeatureStatus, string> = { enabled: "Enabled", disabled: "Disabled", testing: "Testing", coming_soon: "Coming soon" };
const roleLabels: Record<PortalRole, string> = { student: "Students", instructor: "Coaches", admin: "Admins", "sub-admin": "Sub admins" };
const statusStyles: Record<FeatureStatus, string> = {
  enabled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-600",
  testing: "border-sky-200 bg-sky-50 text-sky-700",
  coming_soon: "border-amber-200 bg-amber-50 text-amber-700",
};

function cloneFeatures(features: FeatureRow[]) {
  return JSON.parse(JSON.stringify(features)) as FeatureRow[];
}

function idOf(value: any) {
  return value?._id?.toString?.() || String(value?._id || value || "");
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)} className={cn("inline-flex h-6 w-11 flex-none items-center rounded-full border p-0.5 transition", checked ? "border-teal-500 bg-teal-500" : "border-slate-300 bg-slate-100")}>
      <span className={cn("h-5 w-5 rounded-full bg-white shadow-sm transition", checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

function Modal({ title, description, children, onClose, width = "max-w-3xl" }: { title: string; description?: string; children: React.ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={cn("max-h-[92vh] w-full overflow-hidden rounded-lg bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" title="Close">
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SelectMany({ label, values, options, onChange }: { label: string; values: string[]; options: Array<[string, string]>; onChange: (values: string[]) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select multiple value={values} onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))} className="mt-1 min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

function permissionsForRole(feature: FeatureRow, role: PortalRole) {
  return feature.permissions.filter((permission) => (feature.rolePermissions[role] || []).includes(permission.id)).length;
}

export default function FeatureAccessClient({ initialData }: { initialData: ApiData }) {
  const router = useRouter();
  const [features, setFeatures] = useState(() => cloneFeatures(initialData.features));
  const [savedFeatures, setSavedFeatures] = useState(() => cloneFeatures(initialData.features));
  const [templates, setTemplates] = useState(initialData.templates || []);
  const [audit, setAudit] = useState(initialData.audit || []);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<PortalRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeFeatureKey, setActiveFeatureKey] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState<"apply" | "save" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateRole, setTemplateRole] = useState<PortalRole>("student");
  const [templateDescription, setTemplateDescription] = useState("");
  const dirty = JSON.stringify(features) !== JSON.stringify(savedFeatures);

  const users = useMemo(() => (initialData.users || []).map((user) => [idOf(user), `${user.name || user.email || "User"} (${user.role || "user"})`] as [string, string]), [initialData.users]);
  const batches = useMemo(() => (initialData.batches || []).map((batch) => [idOf(batch), `${batch.name || "Batch"}${batch.level ? `, ${batch.level}` : ""}`] as [string, string]), [initialData.batches]);
  const courses = useMemo(() => (initialData.courses || []).map((course) => [idOf(course), `${course.name || "Course"}${course.level ? `, ${course.level}` : ""}`] as [string, string]), [initialData.courses]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter((feature) => {
      if (q && !`${feature.label} ${feature.description} ${feature.category} ${feature.routes.join(" ")}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && feature.status !== statusFilter) return false;
      if (categoryFilter !== "all" && feature.category !== categoryFilter) return false;
      if (roleFilter !== "all" && !(feature.rolePermissions[roleFilter] || []).length && !feature.pilotRoles.includes(roleFilter)) return false;
      return true;
    });
  }, [categoryFilter, features, query, roleFilter, statusFilter]);

  const activeFeature = features.find((feature) => feature.key === activeFeatureKey) || null;
  const selectedFeatures = features.filter((feature) => selected.includes(feature.key));
  const stats = useMemo(() => ({
    total: features.length,
    enabled: features.filter((feature) => feature.status === "enabled").length,
    testing: features.filter((feature) => feature.status === "testing").length,
    disabled: features.filter((feature) => feature.status === "disabled").length,
    templates: templates.length,
  }), [features, templates.length]);

  function updateFeature(key: string, updater: (feature: FeatureRow) => FeatureRow) {
    setFeatures((current) => current.map((feature) => (feature.key === key ? updater(feature) : feature)));
  }

  function setRolePermission(feature: FeatureRow, role: PortalRole, permission: string, checked: boolean) {
    updateFeature(feature.key, (current) => {
      const values = new Set(current.rolePermissions[role] || []);
      if (checked) values.add(permission);
      else values.delete(permission);
      return { ...current, rolePermissions: { ...current.rolePermissions, [role]: Array.from(values) } };
    });
  }

  function setFeatureStatus(feature: FeatureRow, status: FeatureStatus) {
    updateFeature(feature.key, (current) => ({ ...current, status }));
  }

  function setPilotValues(feature: FeatureRow, field: "pilotRoles" | "pilotUsers" | "pilotBatches" | "pilotCourses", values: string[]) {
    updateFeature(feature.key, (current) => ({ ...current, [field]: values }));
  }

  function addUserOverride(feature: FeatureRow) {
    updateFeature(feature.key, (current) => ({ ...current, userOverrides: [...current.userOverrides, { user: "", access: "allow", permissions: ["view"] }] }));
  }

  function updateUserOverride(feature: FeatureRow, index: number, patch: Partial<FeatureRow["userOverrides"][number]>) {
    updateFeature(feature.key, (current) => ({ ...current, userOverrides: current.userOverrides.map((override, itemIndex) => (itemIndex === index ? { ...override, ...patch } : override)) }));
  }

  function removeUserOverride(feature: FeatureRow, index: number) {
    updateFeature(feature.key, (current) => ({ ...current, userOverrides: current.userOverrides.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function toggleSelected(key: string, checked: boolean) {
    setSelected((current) => checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  }

  function applyBulk(action: string) {
    if (!selected.length) return toast.info("Select at least one feature first");
    setFeatures((current) =>
      current.map((feature) => {
        if (!selected.includes(feature.key)) return feature;
        if (action === "enable") return { ...feature, status: "enabled" };
        if (action === "disable") return { ...feature, status: "disabled" };
        if (action === "testing") return { ...feature, status: "testing" };
        if (action.startsWith("copy:")) {
          const [, fromRole, toRole] = action.split(":") as [string, PortalRole, PortalRole];
          return { ...feature, rolePermissions: { ...feature.rolePermissions, [toRole]: [...(feature.rolePermissions[fromRole] || [])] } };
        }
        if (action === "defaults") {
          const definition = FEATURE_DEFINITIONS.find((item) => item.key === feature.key);
          return {
            ...feature,
            status: definition?.defaultStatus || "disabled",
            rolePermissions: {
              student: [...(definition?.defaultRolePermissions?.student || [])],
              instructor: [...(definition?.defaultRolePermissions?.instructor || [])],
              admin: [...(definition?.defaultRolePermissions?.admin || [])],
              "sub-admin": [...(definition?.defaultRolePermissions?.["sub-admin"] || [])],
            },
          };
        }
        return feature;
      })
    );
    toast.success("Bulk change staged");
    setBulkOpen(false);
  }

  function applyTemplate() {
    const template = templates.find((item) => item.name === templateName);
    if (!template) return toast.error("Choose a template");
    if (!selected.length) return toast.info("Select the features that should receive this template");
    setFeatures((current) => current.map((feature) => selected.includes(feature.key) && template.permissions?.[feature.key] ? { ...feature, rolePermissions: { ...feature.rolePermissions, [template.role]: [...template.permissions[feature.key]] } } : feature));
    toast.success(`${template.name} staged for ${roleLabels[template.role]}`);
    setTemplateOpen(null);
  }

  async function saveTemplate() {
    if (!templateName.trim()) return toast.error("Name the template");
    if (!selected.length) return toast.info("Select features to include in the template");
    const res = await fetch("/api/admin/feature-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: templateName, description: templateDescription, role: templateRole, featureKeys: selected, features }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Could not save template");
    setTemplates(data.templates || templates);
    setAudit(data.audit || audit);
    toast.success("Template saved");
    setTemplateOpen(null);
    setTemplateDescription("");
  }

  async function save() {
    const disabling = features.filter((feature) => {
      const previous = savedFeatures.find((item) => item.key === feature.key);
      return feature.status === "disabled" && previous?.status !== "disabled";
    });
    if (disabling.length && !reason.trim()) return toast.error("Add a reason before disabling a feature globally");
    if (disabling.length && !window.confirm(`Disable ${disabling.length} feature${disabling.length === 1 ? "" : "s"} globally? This removes navigation and blocks direct access immediately.`)) return;

    setSaving(true);
    const res = await fetch("/api/admin/feature-access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, features }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(data.error || "Could not save permissions");
    setFeatures(cloneFeatures(data.features));
    setSavedFeatures(cloneFeatures(data.features));
    setAudit(data.audit || []);
    setReason("");
    router.refresh();
    toast.success(`Permissions saved${data.changedKeys?.length ? ` for ${data.changedKeys.length} feature${data.changedKeys.length === 1 ? "" : "s"}` : ""}`);
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] px-3 py-4 text-slate-950 sm:px-5 lg:px-6">
      <div className="sticky top-0 z-20 -mx-3 mb-5 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100"><ShieldCheck size={21} /></span>
            <div>
              <h1 className="text-2xl font-semibold">Feature Access & Permissions</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Control what each role can see and do, then save once to publish the change.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">Unsaved changes</span>}
            <button type="button" onClick={() => { setFeatures(cloneFeatures(savedFeatures)); setReason(""); }} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
              <RotateCcw size={16} /> Cancel
            </button>
            <button type="button" onClick={save} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50">
              <Save size={16} /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<Layers3 size={17} />} label="Features" value={stats.total} />
        <Stat icon={<Check size={17} />} label="Enabled" value={stats.enabled} />
        <Stat icon={<TestTube2 size={17} />} label="Testing" value={stats.testing} />
        <Stat icon={<Lock size={17} />} label="Disabled" value={stats.disabled} />
        <Stat icon={<CopyCheck size={17} />} label="Templates" value={stats.templates} />
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" placeholder="Search features, routes, or modules" />
        </label>
        <Select value={roleFilter} onChange={(value) => setRoleFilter(value as any)} icon={<Users size={15} />} options={[["all", "All roles"], ...PORTAL_ROLES.map((role) => [role, roleLabels[role]] as [string, string])]} />
        <Select value={statusFilter} onChange={(value) => setStatusFilter(value as any)} icon={<Filter size={15} />} options={[["all", "All statuses"], ...Object.entries(statusLabels)]} />
        <Select value={categoryFilter} onChange={setCategoryFilter} icon={<Layers3 size={15} />} options={[["all", "All modules"], ...FEATURE_CATEGORIES.map((category) => [category, category] as [string, string])]} />
        <button type="button" onClick={() => setSelected(filtered.map((feature) => feature.key))} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Select shown</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-sm text-slate-600"><span className="font-semibold text-slate-950">{selected.length}</span> selected of {filtered.length} shown</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected([])} className="h-9 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear</button>
          <button type="button" onClick={() => setBulkOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><SlidersHorizontal size={15} /> Bulk actions</button>
          <button type="button" onClick={() => setTemplateOpen("apply")} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Sparkles size={15} /> Apply template</button>
          <button type="button" onClick={() => setTemplateOpen("save")} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white"><Plus size={15} /> Save template</button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {filtered.map((feature) => (
            <article key={feature.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <input type="checkbox" checked={selected.includes(feature.key)} onChange={(event) => toggleSelected(feature.key, event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{feature.label}</h2>
                      <span className={cn("rounded-md border px-2 py-1 text-xs font-bold", statusStyles[feature.status])}>{statusLabels[feature.status]}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{feature.category}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{feature.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      {PORTAL_ROLES.map((role) => <span key={role} className="rounded-md border border-slate-200 px-2 py-1">{roleLabels[role]}: {permissionsForRole(feature, role)}</span>)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={feature.status} onChange={(event) => setFeatureStatus(feature, event.target.value as FeatureStatus)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveFeatureKey(feature.key)} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"><Settings2 size={15} /> Configure</button>
                </div>
              </div>
            </article>
          ))}
          {!filtered.length && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No features match these filters.</div>}
        </div>

        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><AlertTriangle size={16} className="text-amber-500" /> Critical change reason</h2>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" placeholder="Required when globally disabling features" />
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History size={16} /> Audit history</h2>
            <div className="mt-3 max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {audit.length === 0 && <p className="py-3 text-sm text-slate-500">No permission changes recorded yet.</p>}
              {audit.map((item) => (
                <div key={item._id} className="py-3 text-sm">
                  <div className="font-semibold text-slate-800">{item.targetLabel || item.featureLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.actor?.name || item.actor?.email || "Admin"} changed {item.targetType} on {new Date(item.createdAt).toLocaleString()}{item.reason ? `: ${item.reason}` : ""}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {activeFeature && (
        <Modal title={activeFeature.label} description={activeFeature.description} onClose={() => setActiveFeatureKey(null)} width="max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">{activeFeature.routes.length ? activeFeature.routes.join(", ") : "API-only feature"}</div>
            <select value={activeFeature.status} onChange={(event) => setFeatureStatus(activeFeature, event.target.value as FeatureStatus)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <RoleGrid feature={activeFeature} setRolePermission={setRolePermission} />
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-4">
            <SelectMany label="Pilot roles" values={activeFeature.pilotRoles} options={PORTAL_ROLES.map((role) => [role, roleLabels[role]])} onChange={(values) => setPilotValues(activeFeature, "pilotRoles", values)} />
            <SelectMany label="Pilot users" values={activeFeature.pilotUsers} options={users} onChange={(values) => setPilotValues(activeFeature, "pilotUsers", values)} />
            <SelectMany label="Pilot batches" values={activeFeature.pilotBatches} options={batches} onChange={(values) => setPilotValues(activeFeature, "pilotBatches", values)} />
            <SelectMany label="Pilot courses" values={activeFeature.pilotCourses} options={courses} onChange={(values) => setPilotValues(activeFeature, "pilotCourses", values)} />
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">User overrides</h3>
              <button type="button" onClick={() => addUserOverride(activeFeature)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={15} /> Add override</button>
            </div>
            <div className="space-y-2">
              {activeFeature.userOverrides.map((override, index) => (
                <div key={`${activeFeature.key}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <select value={override.user} onChange={(event) => updateUserOverride(activeFeature, index, { user: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Select user</option>
                    {users.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                  </select>
                  <select value={override.access} onChange={(event) => updateUserOverride(activeFeature, index, { access: event.target.value as any })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="role_default">Use role default</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                  <input value={override.note || ""} onChange={(event) => updateUserOverride(activeFeature, index, { note: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" placeholder="Note" />
                  <button type="button" onClick={() => removeUserOverride(activeFeature, index)} className="h-10 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">Remove</button>
                </div>
              ))}
              {!activeFeature.userOverrides.length && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">No user overrides for this feature.</p>}
            </div>
          </div>
        </Modal>
      )}

      {bulkOpen && (
        <Modal title="Bulk actions" description={`${selected.length} selected feature${selected.length === 1 ? "" : "s"}`} onClose={() => setBulkOpen(false)} width="max-w-xl">
          <div className="grid gap-2">
            {[
              ["enable", "Enable selected"],
              ["disable", "Disable selected"],
              ["testing", "Move selected to testing"],
              ["copy:student:instructor", "Copy Students permissions to Coaches"],
              ["copy:student:admin", "Copy Students permissions to Admins"],
              ["copy:admin:sub-admin", "Copy Admin permissions to Sub admins"],
              ["copy:instructor:student", "Copy Coaches permissions to Students"],
              ["defaults", "Restore selected defaults"],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => applyBulk(value)} className="flex h-11 items-center justify-between rounded-md border border-slate-200 px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {label}<ChevronDown size={15} className="-rotate-90 text-slate-400" />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {templateOpen && (
        <Modal title={templateOpen === "apply" ? "Apply permission template" : "Save permission template"} description={`${selected.length} selected feature${selected.length === 1 ? "" : "s"}`} onClose={() => setTemplateOpen(null)} width="max-w-2xl">
          {templateOpen === "apply" ? (
            <div className="space-y-4">
              <select value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="">Choose template</option>
                {templates.map((template) => <option key={template._id} value={template.name}>{template.name} - {roleLabels[template.role]}</option>)}
              </select>
              <button type="button" onClick={applyTemplate} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white"><Sparkles size={15} /> Apply to selected</button>
            </div>
          ) : (
            <div className="space-y-3">
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Template name" />
              <textarea value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="Short description" />
              <select value={templateRole} onChange={(event) => setTemplateRole(event.target.value as PortalRole)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                {PORTAL_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
              <button type="button" onClick={saveTemplate} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"><Save size={15} /> Save template</button>
            </div>
          )}
          {selectedFeatures.length > 0 && <div className="mt-5 rounded-md bg-slate-50 p-3 text-sm text-slate-600">Includes: {selectedFeatures.slice(0, 8).map((feature) => feature.label).join(", ")}{selectedFeatures.length > 8 ? `, +${selectedFeatures.length - 8} more` : ""}</div>}
        </Modal>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">{icon}<span className="text-xs font-bold uppercase">{label}</span></div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Select({ value, onChange, options, icon }: { value: string; onChange: (value: string) => void; options: Array<[string, string]>; icon: React.ReactNode }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-3 top-3 text-slate-400">{icon}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100">
        {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
      </select>
    </label>
  );
}

function RoleGrid({ feature, setRolePermission }: { feature: FeatureRow; setRolePermission: (feature: FeatureRow, role: PortalRole, permission: string, checked: boolean) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-52 px-3 py-3">Permission</th>
            {PORTAL_ROLES.map((role) => <th key={role} className="px-3 py-3">{roleLabels[role]}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {feature.permissions.map((permission) => (
            <tr key={permission.id}>
              <td className="px-3 py-3 font-medium text-slate-800">
                <span className="inline-flex items-center gap-1.5">{permission.critical && <AlertTriangle size={14} className="text-amber-500" />} {permission.label}</span>
              </td>
              {PORTAL_ROLES.map((role) => (
                <td key={role} className="px-3 py-3">
                  <Toggle checked={(feature.rolePermissions[role] || []).includes(permission.id)} onChange={(checked) => setRolePermission(feature, role, permission.id, checked)} label={`${permission.label} for ${roleLabels[role]}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
