"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
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
type AuditItem = {
  _id: string;
  featureLabel: string;
  targetType: string;
  reason?: string;
  actor?: { name?: string; email?: string; username?: string };
  createdAt: string;
};
type TemplateItem = { _id: string; name: string; description?: string; role: PortalRole; permissions?: Record<string, string[]> };
type ApiData = { features: FeatureRow[]; users: Lookup[]; batches: Lookup[]; courses: Lookup[]; audit: AuditItem[]; templates: TemplateItem[] };

const statusLabels: Record<FeatureStatus, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  testing: "Testing",
  coming_soon: "Coming Soon",
};

const roleLabels: Record<PortalRole, string> = {
  student: "Students",
  instructor: "Coaches",
  admin: "Admins",
};

function cloneFeatures(features: FeatureRow[]) {
  return JSON.parse(JSON.stringify(features)) as FeatureRow[];
}

function idOf(value: any) {
  return value?._id?.toString?.() || String(value?._id || value || "");
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-7 w-12 flex-none items-center rounded-full border p-0.5 transition",
        checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-slate-100"
      )}
    >
      <span className={cn("h-5 w-5 rounded-full bg-white shadow-sm transition", checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

function SelectMany({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: Array<[string, string]>;
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <select
        multiple
        value={values}
        onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))}
        className="mt-1 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function FeatureAccessClient({ initialData }: { initialData: ApiData }) {
  const [features, setFeatures] = useState(() => cloneFeatures(initialData.features));
  const [savedFeatures, setSavedFeatures] = useState(() => cloneFeatures(initialData.features));
  const [audit, setAudit] = useState(initialData.audit || []);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<PortalRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set(FEATURE_CATEGORIES));
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const dirty = JSON.stringify(features) !== JSON.stringify(savedFeatures);

  const users = useMemo(
    () => (initialData.users || []).map((user) => [idOf(user), `${user.name || user.email || "User"} (${user.role || "user"})`] as [string, string]),
    [initialData.users]
  );
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

  function updateFeature(key: string, updater: (feature: FeatureRow) => FeatureRow) {
    setFeatures((current) => current.map((feature) => (feature.key === key ? updater(feature) : feature)));
  }

  function toggleCategory(category: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
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
    updateFeature(feature.key, (current) => ({
      ...current,
      userOverrides: current.userOverrides.map((override, itemIndex) => (itemIndex === index ? { ...override, ...patch } : override)),
    }));
  }

  function removeUserOverride(feature: FeatureRow, index: number) {
    updateFeature(feature.key, (current) => ({ ...current, userOverrides: current.userOverrides.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function applyBulk(action: string) {
    if (!selected.length) return;
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
            },
          };
        }
        return feature;
      })
    );
  }

  function applyTemplate() {
    const template = initialData.templates.find((item) => item.name === templateName);
    if (!template || !selected.length) return;
    setFeatures((current) =>
      current.map((feature) =>
        selected.includes(feature.key) && template.permissions?.[feature.key]
          ? { ...feature, rolePermissions: { ...feature.rolePermissions, [template.role]: [...template.permissions[feature.key]] } }
          : feature
      )
    );
  }

  async function save() {
    const disabling = features.filter((feature) => {
      const previous = savedFeatures.find((item) => item.key === feature.key);
      return feature.status === "disabled" && previous?.status !== "disabled";
    });
    if (disabling.length && !reason.trim()) {
      setMessage("Add a reason before disabling a feature globally.");
      return;
    }
    if (disabling.length) {
      const ok = window.confirm(`Disable ${disabling.length} feature${disabling.length === 1 ? "" : "s"} globally? This removes navigation and blocks direct access immediately.`);
      if (!ok) return;
    }
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/feature-access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, features }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Could not save permissions.");
      return;
    }
    setFeatures(cloneFeatures(data.features));
    setSavedFeatures(cloneFeatures(data.features));
    setAudit(data.audit || []);
    setReason("");
    setMessage("Permission changes saved.");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter((feature) => {
      if (q && !`${feature.label} ${feature.description} ${feature.category}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && feature.status !== statusFilter) return false;
      if (categoryFilter !== "all" && feature.category !== categoryFilter) return false;
      if (roleFilter !== "all" && !(feature.rolePermissions[roleFilter] || []).length && !feature.pilotRoles.includes(roleFilter)) return false;
      return true;
    });
  }, [categoryFilter, features, query, roleFilter, statusFilter]);

  const grouped = FEATURE_CATEGORIES.map((category) => ({ category, features: filtered.filter((feature) => feature.category === category) })).filter((group) => group.features.length);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-950 sm:px-5 lg:px-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-purple-700">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Feature Access & Permissions</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Control feature status, role actions, pilot access, sidebar visibility, and release readiness from one Super Admin surface.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">Unsaved changes</span>}
          <button type="button" onClick={() => { setFeatures(cloneFeatures(savedFeatures)); setReason(""); }} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <RotateCcw size={16} /> Cancel
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {message && <div className={cn("mb-4 rounded-md border px-4 py-3 text-sm font-semibold", message.includes("saved") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>{message}</div>}

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100" placeholder="Search features" />
        </label>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as any)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All roles</option>
          {PORTAL_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All modules</option>
          {FEATURE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700"><SlidersHorizontal size={16} /> Bulk Actions</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <select onChange={(event) => applyBulk(event.target.value)} defaultValue="" className="h-10 rounded-md border border-slate-200 px-3 text-sm">
            <option value="" disabled>Choose bulk action</option>
            <option value="enable">Enable selected</option>
            <option value="disable">Disable selected</option>
            <option value="testing">Move selected to Testing</option>
            <option value="copy:student:instructor">Copy Students to Coaches</option>
            <option value="copy:student:admin">Copy Students to Admins</option>
            <option value="copy:instructor:student">Copy Coaches to Students</option>
            <option value="defaults">Restore selected defaults</option>
          </select>
          <select value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
            <option value="">Permission template</option>
            {initialData.templates.map((template) => <option key={template._id} value={template.name}>{template.name}</option>)}
          </select>
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm" placeholder="Reason for critical changes" />
          <button type="button" onClick={applyTemplate} className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white">Apply Template</button>
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map((group) => {
          const open = expanded.has(group.category);
          return (
            <section key={group.category} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => toggleCategory(group.category)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="font-semibold">{group.category}</span>
                <ChevronDown size={18} className={cn("transition", open ? "rotate-180" : "")} />
              </button>
              {open && (
                <div className="divide-y divide-slate-100">
                  {group.features.map((feature) => {
                    const selectedFeature = selected.includes(feature.key);
                    return (
                      <article key={feature.key} className="p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <input type="checkbox" checked={selectedFeature} onChange={(event) => setSelected((current) => event.target.checked ? [...current, feature.key] : current.filter((key) => key !== feature.key))} className="mt-1 h-4 w-4 rounded border-slate-300 text-purple-700" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold">{feature.label}</h2>
                                <span className={cn("rounded-md px-2 py-1 text-xs font-bold", feature.status === "enabled" ? "bg-emerald-50 text-emerald-700" : feature.status === "testing" ? "bg-sky-50 text-sky-700" : feature.status === "coming_soon" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{statusLabels[feature.status]}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-500">{feature.description}</p>
                              <p className="mt-1 text-xs text-slate-400">{feature.routes.join(", ")}</p>
                            </div>
                          </div>
                          <select value={feature.status} onChange={(event) => setFeatureStatus(feature, event.target.value as FeatureStatus)} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead className="text-xs uppercase text-slate-500">
                              <tr>
                                <th className="w-44 px-2 py-2">Permission</th>
                                {PORTAL_ROLES.map((role) => <th key={role} className="px-2 py-2">{roleLabels[role]}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {feature.permissions.map((permission) => (
                                <tr key={permission.id} className="border-t border-slate-100">
                                  <td className="px-2 py-2 font-medium text-slate-700">
                                    <span className="inline-flex items-center gap-1.5">{permission.critical && <AlertTriangle size={14} className="text-amber-500" />} {permission.label}</span>
                                  </td>
                                  {PORTAL_ROLES.map((role) => (
                                    <td key={role} className="px-2 py-2">
                                      <Toggle checked={(feature.rolePermissions[role] || []).includes(permission.id)} onChange={(checked) => setRolePermission(feature, role, permission.id, checked)} label={`${permission.label} for ${roleLabels[role]}`} />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Testing, pilot access, and user overrides</summary>
                          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <SelectMany label="Pilot roles" values={feature.pilotRoles} options={PORTAL_ROLES.map((role) => [role, roleLabels[role]])} onChange={(values) => setPilotValues(feature, "pilotRoles", values)} />
                            <SelectMany label="Pilot users" values={feature.pilotUsers} options={users} onChange={(values) => setPilotValues(feature, "pilotUsers", values)} />
                            <SelectMany label="Pilot batches" values={feature.pilotBatches} options={batches} onChange={(values) => setPilotValues(feature, "pilotBatches", values)} />
                            <SelectMany label="Pilot courses" values={feature.pilotCourses} options={courses} onChange={(values) => setPilotValues(feature, "pilotCourses", values)} />
                          </div>
                          <div className="mt-4 space-y-2">
                            {feature.userOverrides.map((override, index) => (
                              <div key={`${feature.key}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-white p-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                                <select value={override.user} onChange={(event) => updateUserOverride(feature, index, { user: event.target.value })} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                                  <option value="">Select user</option>
                                  {users.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                                </select>
                                <select value={override.access} onChange={(event) => updateUserOverride(feature, index, { access: event.target.value as any })} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                                  <option value="role_default">Use Role Default</option>
                                  <option value="allow">Allow</option>
                                  <option value="deny">Deny</option>
                                </select>
                                <input value={override.note || ""} onChange={(event) => updateUserOverride(feature, index, { note: event.target.value })} className="h-10 rounded-md border border-slate-200 px-3 text-sm" placeholder="Note" />
                                <button type="button" onClick={() => removeUserOverride(feature, index)} className="h-10 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-600">Remove</button>
                              </div>
                            ))}
                            <button type="button" onClick={() => addUserOverride(feature)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Add User Override</button>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Audit History</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {audit.length === 0 && <p className="py-3 text-sm text-slate-500">No permission changes recorded yet.</p>}
          {audit.map((item) => (
            <div key={item._id} className="py-3 text-sm">
              <div className="font-semibold text-slate-800">{item.featureLabel}</div>
              <div className="mt-1 text-slate-500">
                {item.actor?.name || item.actor?.email || "Admin"} changed {item.targetType} on {new Date(item.createdAt).toLocaleString()}
                {item.reason ? `: ${item.reason}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
