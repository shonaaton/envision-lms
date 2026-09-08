"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { FEATURE_CATEGORIES, FEATURE_DEFINITIONS } from "@/lib/featureRegistry";
import { ESSENTIAL_ROLE_GRANTS, PROTECTED_ROLE_FEATURES, type NamedRole, type RoleGrants } from "@/lib/accessRolePolicy";

type Draft = { _id?: string; name: string; description: string; permissions: RoleGrants; isActive: boolean; updatedAt?: string; memberCount?: number };

export default function RoleManager() {
  const [roles, setRoles] = useState<NamedRole[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load roles.");
      setRoles(data.roles); setCanManage(data.canManage); setStatuses(data.statuses || {});
    } catch (error: any) { setError(error.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    try {
      const response = await fetch(draft._id ? `/api/admin/roles/${draft._id}` : "/api/admin/roles", {
        method: draft._id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, description: draft.description, permissions: draft.permissions, isActive: draft.isActive, updatedAt: draft.updatedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save role.");
      toast.success("Role saved. Assigned accounts use these permissions on their next request.");
      setDraft(null); await load();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  }

  async function remove(role: NamedRole) {
    if (!window.confirm(`Remove ${role.name}? Its name remains reserved in the audit history.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/roles/${role._id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove role.");
      toast.success("Role removed"); await load();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  }

  function toggle(key: string, permission: string, checked: boolean) {
    setDraft(current => {
      if (!current) return current;
      const existing = current.permissions[key] || [];
      const values = checked ? Array.from(new Set([...existing, "view", permission])) : permission === "view" ? [] : existing.filter(item => item !== permission);
      return { ...current, permissions: { ...current.permissions, [key]: Array.from(new Set([...values, ...(ESSENTIAL_ROLE_GRANTS[key] || [])])) } };
    });
  }

  function selectCategory(category: string, selected: boolean) {
    setDraft(current => {
      if (!current) return current;
      const permissions = { ...current.permissions };
      FEATURE_DEFINITIONS.filter(feature => feature.category === category && !PROTECTED_ROLE_FEATURES.includes(feature.key)).forEach(feature => {
        permissions[feature.key] = selected ? feature.permissions.map(item => item.id) : [...(ESSENTIAL_ROLE_GRANTS[feature.key] || [])];
      });
      return { ...current, permissions };
    });
  }

  if (loading) return <div className="mt-5 animate-pulse rounded-lg bg-slate-100 p-8 text-sm">Loading roles…</div>;
  if (error) return <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={load} className="underline">Retry</button></div>;

  return <div className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} /> Roles & access</h2><p className="text-sm text-slate-500">Name a role, choose its features, then assign it in Staff → Add or Edit.</p></div>
      {canManage && <button className="btn-primary" onClick={() => { setSearch(""); setDraft({ name: "", description: "", permissions: { ...ESSENTIAL_ROLE_GRANTS }, isActive: true }); }}><Plus size={16} className="mr-1" /> Create Role</button>}
    </div>
    {!canManage && <p className="text-sm text-amber-800">Only a Super Admin can create, edit, or assign staff roles.</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {roles.map(role => <article key={role._id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{role.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${role.isActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{role.isActive ? "Active" : "Inactive"}</span></div>
        <p className="mt-1 min-h-10 text-xs text-slate-500">{role.description || "Custom staff role"}</p>
        <p className="mt-3 text-xs font-medium text-slate-600">{role.memberCount} assigned · {Object.values(role.permissions).filter(values => values.length).length} features</p>
        {canManage && <div className="mt-3 flex items-center gap-2"><button className="btn-outline text-xs" onClick={() => { setSearch(""); setDraft({ ...role, permissions: structuredClone(role.permissions) }); }}>Edit access</button><button aria-label={`Duplicate ${role.name}`} className="rounded-md p-2 hover:bg-slate-100" onClick={() => { setSearch(""); setDraft({ name: `${role.name} copy`, description: role.description, permissions: structuredClone(role.permissions), isActive: true }); }}><Copy size={15} /></button><button aria-label={`Remove ${role.name}`} title={role.memberCount ? "Reassign members before removing" : "Remove role"} disabled={saving || role.memberCount > 0} className="ml-auto rounded-md p-2 text-red-600 disabled:opacity-30" onClick={() => remove(role)}><Trash2 size={15} /></button></div>}
      </article>)}
    </div>
    <p className="text-xs text-slate-500">Student, Coach, Admin, and Sub Admin remain available as built-in roles. A named role replaces the account’s old feature templates and individual overrides. Security administration stays with Super Admins.</p>
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-5">
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="role-editor-title" className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4"><h2 id="role-editor-title" className="text-lg font-semibold">{draft._id ? "Edit role" : "Create role"}</h2><button type="button" aria-label="Close role editor" disabled={saving} onClick={() => setDraft(null)}><X size={20} /></button></div>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Role name<input autoFocus required minLength={2} maxLength={80} className="input mt-1" value={draft.name} placeholder="e.g. Student Relationships" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label className="text-xs font-semibold">Description<input maxLength={500} className="input mt-1" value={draft.description} placeholder="What this team handles" onChange={event => setDraft({ ...draft, description: event.target.value })} /></label></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /> Active role</label>
          {!draft.isActive && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Assigned members will lose workspace access until this role is reactivated.</p>}
          <div className="rounded-lg bg-purple-50 p-3 text-xs text-purple-900">{FEATURE_DEFINITIONS.length} features listed across {FEATURE_CATEGORIES.length} categories. Home, personal profile, password changes, and personal notifications are included. Disabled or pilot features still follow the academy’s release controls.</div>
          <label className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Search features" className="input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search categories, features, or permissions…" /></label>
          {FEATURE_CATEGORIES.map(category => {
            const features = FEATURE_DEFINITIONS.filter(feature => feature.category === category && `${category} ${feature.label} ${feature.description} ${feature.permissions.map(item => item.label).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
            if (!features.length) return null;
            return <section key={category} className="overflow-hidden rounded-lg border border-slate-200"><div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3 py-2"><h3 className="mr-auto text-sm font-semibold">{category}</h3><button type="button" className="text-xs text-purple-700" onClick={() => selectCategory(category, true)}>Allow category</button><button type="button" className="text-xs text-slate-600" onClick={() => selectCategory(category, false)}>Clear category</button></div>
              {features.map(feature => { const protectedFeature = PROTECTED_ROLE_FEATURES.includes(feature.key); const status = statuses[feature.key] || feature.defaultStatus || "disabled";
                return <div key={feature.key} className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"><div><h4 className="text-sm font-medium">{feature.label} {protectedFeature && <span className="text-xs text-amber-700">· Super Admin only</span>}{status !== "enabled" && <span className="text-xs text-slate-500"> · {status.replace("_", " ")}</span>}</h4><p className="mt-0.5 text-xs text-slate-500">{feature.description}</p></div><div className="flex flex-wrap items-center gap-x-4 gap-y-2">{feature.permissions.map(permission => <label key={permission.id} className={`flex items-center gap-1.5 text-xs ${protectedFeature ? "text-slate-400" : "text-slate-700"}`}><input type="checkbox" disabled={protectedFeature || ESSENTIAL_ROLE_GRANTS[feature.key]?.includes(permission.id)} checked={draft.permissions[feature.key]?.includes(permission.id) || false} onChange={event => toggle(feature.key, permission.id, event.target.checked)} />{permission.label}</label>)}</div></div>;
              })}</section>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 p-4"><p className="text-xs text-slate-600">{Object.values(draft.permissions).filter(values => values.length).length} features selected{draft.memberCount ? ` · Changes apply to ${draft.memberCount} members` : ""}</p><div className="flex gap-2"><button type="button" className="btn-outline" disabled={saving} onClick={() => setDraft(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Role"}</button></div></div>
      </form>
    </div>}
  </div>;
}
