"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Download, Eye, KeyRound, Loader2, MoreVertical, Pencil, Plus, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, CredentialsNote, Drawer, Field, api } from "./shared";

type BranchUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  kind: "students" | "staff";
  branchRole: string;
  isActive: boolean;
  tempPassword: string;
  passwordChangedAt: string | null;
  passwordChangeSource: string;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  avatar: string;
  studentId: string;
  regNo: string;
  parentName: string;
  slots: string[];
};

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", coach: "Coach" };
const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value))
    : "";

function passwordStatus(user: BranchUser) {
  if (user.tempPassword) return "Temporary password active";
  if (!user.passwordChangedAt) return "Password set";
  return `${user.passwordChangeSource === "self_reset" ? "Updated by user" : "Updated"} ${when(user.passwordChangedAt)}`;
}

function copyLogin(user: BranchUser) {
  void navigator.clipboard?.writeText(`User ID: ${user.username}\nPassword: ${user.tempPassword}\nLogin: ${window.location.origin}/login`);
  toast.success("Login details copied.");
}

export default function UsersClient({ can }: { can: string[] }) {
  const [kind, setKind] = useState<"students" | "staff">("students");
  const [users, setUsers] = useState<BranchUser[] | null>(null);
  const [me, setMe] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  // Placed against the viewport: the table scrolls sideways and would clip a menu inside it.
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [details, setDetails] = useState<BranchUser | null>(null);
  const [editing, setEditing] = useState<BranchUser | null>(null);
  const [leaving, setLeaving] = useState<BranchUser | null>(null);
  const [deleting, setDeleting] = useState<BranchUser | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; username: string; password: string } | null>(null);

  const load = useCallback(async (which: "students" | "staff") => {
    try {
      const data = await api<{ users: BranchUser[]; me: string }>(`/api/bowbazar/users?kind=${which}`);
      setUsers(data.users);
      setMe(data.me);
    } catch (error: any) {
      toast.error(error.message);
    }
  }, []);

  useEffect(() => {
    setUsers(null);
    void load(kind);
  }, [kind, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((user) => {
      if (status === "active" && !user.isActive) return false;
      if (status === "inactive" && user.isActive) return false;
      if (!q) return true;
      return [user.name, user.username, user.email, user.phone, user.regNo, user.parentName].some((value) => value.toLowerCase().includes(q));
    });
  }, [users, query, status]);

  const counts = useMemo(() => ({ active: (users || []).filter((user) => user.isActive).length, inactive: (users || []).filter((user) => !user.isActive).length }), [users]);

  async function resetPassword(user: BranchUser) {
    if (!window.confirm(`Make a new password for ${user.name}? The old one stops working.`)) return;
    try {
      const data = await api<{ username: string; password: string }>(`/api/bowbazar/users/${user.id}`, { method: "PATCH", json: { action: "resetPassword" } });
      setCredentials({ name: user.name, ...data });
      void load(kind);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function reactivate(user: BranchUser) {
    try {
      await api(`/api/bowbazar/users/${user.id}`, { method: "PATCH", json: { action: "setActive", active: true } });
      toast.success(`${user.name} can sign in again.`);
      void load(kind);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function deactivateStaff(user: BranchUser) {
    if (!window.confirm(`Switch off ${user.name}'s login?`)) return;
    try {
      await api(`/api/bowbazar/users/${user.id}`, { method: "PATCH", json: { action: "setActive", active: false } });
      toast.success(`${user.name} can no longer sign in.`);
      void load(kind);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  function exportCsv() {
    const rows = [
      ["User ID", "Name", kind === "students" ? "Reg. no" : "Role", "Email", "Phone", "Status", "Password", "Last login"],
      ...shown.map((user) => [
        user.username,
        user.name,
        kind === "students" ? user.regNo : ROLE_LABEL[user.branchRole] || user.branchRole,
        user.email,
        user.phone,
        user.isActive ? "Active" : "Inactive",
        passwordStatus(user),
        when(user.lastLoginAt),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `bowbazar-${kind}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const isProtected = (user: BranchUser) => user.branchRole === "admin" || user.id === me;

  const actions = (user: BranchUser) => [
    { icon: Eye, label: "View details", onClick: () => setDetails(user) },
    { icon: Pencil, label: "Edit", onClick: () => setEditing(user) },
    ...(user.id !== me ? [{ icon: KeyRound, label: "Reset password", onClick: () => void resetPassword(user) }] : []),
    ...(!isProtected(user)
      ? [
          user.isActive
            ? { icon: UserX, label: "Deactivate access", onClick: () => (user.kind === "students" ? setLeaving(user) : void deactivateStaff(user)) }
            : { icon: UserCheck, label: "Reactivate access", onClick: () => void reactivate(user) },
          { icon: Trash2, label: "Delete permanently", danger: true, onClick: () => setDeleting(user) },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Users"
        subtitle="Every Bowbazar login: reset passwords, edit details, switch access off or on."
        can={can}
        actions={
          kind === "students" ? (
            <Link href="/bowbazar/students" className="btn-primary h-10">
              <Plus size={16} /> Add student
            </Link>
          ) : (
            <button type="button" className="btn-primary h-10" onClick={() => setAddingStaff(true)}>
              <Plus size={16} /> Add staff
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-bold">
          {(["students", "staff"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn("rounded-md px-3 py-1.5", kind === value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {value === "students" ? "Students" : "Staff"}
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-10 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, user ID, email, phone" />
        </div>
        <select className="input h-10 w-auto" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All ({(users || []).length})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="inactive">Inactive ({counts.inactive})</option>
        </select>
        <button type="button" className="btn-outline h-10 px-3" onClick={exportCsv} disabled={!shown.length} title="Download as CSV">
          <Download size={16} />
        </button>
      </div>

      {credentials && (
        <div className="space-y-2">
          <div className="text-sm font-bold text-slate-900">New password for {credentials.name}</div>
          <CredentialsNote username={credentials.username} password={credentials.password} note="Shown only now. Share it with them; they can change it in Account Settings." />
          <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => setCredentials(null)}>Done</button>
        </div>
      )}

      <section className="rounded-lg border border-brand/10 bg-white shadow-sm">
        {!users ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading users...</div>
        ) : !shown.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No {kind} match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">User ID</th>
                  <th className="px-4 py-2">Password</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((user, index) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400">{index + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-800">{user.username}</td>
                    <td className="px-4 py-2.5">
                      {user.tempPassword ? (
                        <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800" onClick={() => copyLogin(user)}>
                          Temporary password <Copy size={12} />
                        </button>
                      ) : (
                        <span className="whitespace-nowrap rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{passwordStatus(user)}</span>
                      )}
                      {user.lockedUntil && <span className="ml-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Locked</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button type="button" className="whitespace-nowrap text-left font-semibold text-slate-950 hover:text-brand" onClick={() => setDetails(user)}>
                        {user.name}
                      </button>
                      <div className="whitespace-nowrap text-xs text-slate-500">
                        {kind === "students" ? [user.regNo, user.slots.join(", ")].filter(Boolean).join(" · ") : ROLE_LABEL[user.branchRole] || user.branchRole}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{user.email || <span className="text-slate-400">No email</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{user.phone}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label={`Actions for ${user.name}`}
                        onClick={(event) => {
                          const box = event.currentTarget.getBoundingClientRect();
                          setMenu(menu?.id === user.id ? null : { id: user.id, top: box.bottom + 4, right: window.innerWidth - box.right });
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {menu && (users || []).some((user) => user.id === menu.id) && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
            style={{ top: Math.min(menu.top, window.innerHeight - 230), right: menu.right }}
          >
            {actions((users || []).find((user) => user.id === menu.id)!).map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setMenu(null);
                  action.onClick();
                }}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50", "danger" in action && action.danger ? "text-red-700" : "text-slate-700")}
              >
                <action.icon size={15} /> {action.label}
              </button>
            ))}
          </div>
        </>
      )}
      {details && <DetailsDrawer user={details} onClose={() => setDetails(null)} />}
      {editing && <EditDrawer user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(kind); }} />}
      {leaving && <LeaveDrawer user={leaving} onClose={() => setLeaving(null)} onDone={() => { setLeaving(null); void load(kind); }} />}
      {deleting && <DeleteDrawer user={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); void load(kind); }} />}
      {addingStaff && (
        <AddStaffDrawer
          onClose={() => setAddingStaff(false)}
          onCreated={(created) => {
            setAddingStaff(false);
            setCredentials(created);
            void load(kind);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value || "-"}</span>
    </div>
  );
}

function DetailsDrawer({ user, onClose }: { user: BranchUser; onClose: () => void }) {
  return (
    <Drawer title={user.name} onClose={onClose}>
      <div>
        <Row label="User ID" value={user.username} />
        <Row label={user.kind === "students" ? "Type" : "Role"} value={user.kind === "students" ? "Student" : ROLE_LABEL[user.branchRole] || user.branchRole} />
        {user.kind === "students" && <Row label="Reg. no" value={user.regNo} />}
        {user.kind === "students" && <Row label="Parent" value={user.parentName} />}
        {user.kind === "students" && <Row label="Slots" value={user.slots.join(", ")} />}
        <Row label="Email" value={user.email || "No email (signs in with the user ID)"} />
        <Row label="Phone" value={user.phone} />
        <Row label="Status" value={user.isActive ? "Active" : "Inactive"} />
        <Row label="Password" value={user.tempPassword ? "Temporary password available" : passwordStatus(user)} />
        {user.lockedUntil && <Row label="Sign-in" value={`Locked after wrong passwords until ${when(user.lockedUntil)}. A password reset unlocks it.`} />}
        <Row label="Last login" value={when(user.lastLoginAt) || "Never"} />
        <Row label="Created" value={when(user.createdAt)} />
      </div>
      {user.tempPassword && (
        <button type="button" className="btn-primary h-10" onClick={() => copyLogin(user)}>
          <Copy size={15} /> Copy login details
        </button>
      )}
    </Drawer>
  );
}

function EditDrawer({ user, onClose, onSaved }: { user: BranchUser; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone, branchRole: user.branchRole });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/users/${user.id}`, { method: "PATCH", json: { action: "update", ...form } });
      toast.success("Saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`Edit ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      <Field label="Name *">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <Field label={user.kind === "students" ? "Email" : "Email *"} hint={user.kind === "students" ? "Leave empty if the family has none; they sign in with the user ID." : undefined}>
        <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
      </Field>
      <Field label="Phone">
        <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
      </Field>
      {user.kind === "staff" && user.branchRole !== "admin" && (
        <Field label="Role">
          <select className="input" value={form.branchRole} onChange={(event) => set({ branchRole: event.target.value })}>
            <option value="coach">Coach: attendance and homework</option>
            <option value="manager">Manager: also students, slots, fees and admissions</option>
          </select>
        </Field>
      )}
      {user.kind === "students" && (
        <p className="text-xs text-slate-500">
          Slots, fee and family details are on the <Link href="/bowbazar/students" className="font-bold text-brand underline">Students</Link> page.
        </p>
      )}
    </Drawer>
  );
}

function LeaveDrawer({ user, onClose, onDone }: { user: BranchUser; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/users/${user.id}`, { method: "PATCH", json: { action: "setActive", active: false, reason } });
      toast.success(`${user.name} marked inactive. Their seat is free.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Drawer
      title={`Deactivate ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving || !reason.trim()} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Deactivate
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">They can no longer sign in, their seat is freed and no new monthly fees are raised. Their history stays.</p>
      <Field label="Why are they leaving? *">
        <textarea className="input min-h-[80px]" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Drawer>
  );
}

function DeleteDrawer({ user, onClose, onDone }: { user: BranchUser; onClose: () => void; onDone: () => void }) {
  const [confirmName, setConfirmName] = useState("");
  const [saving, setSaving] = useState(false);
  async function remove() {
    setSaving(true);
    try {
      await api(`/api/bowbazar/users/${user.id}`, { method: "DELETE", json: { confirmName } });
      toast.success(`${user.name} was deleted.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Drawer
      title={`Delete ${user.name} permanently`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10 bg-red-700 hover:bg-red-800" disabled={saving || confirmName !== user.name} onClick={() => void remove()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Delete permanently
          </button>
        </>
      }
    >
      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        This can&apos;t be undone.{" "}
        {user.kind === "students"
          ? "The login, the student's branch record, all their monthly fee records and payments, their homework answers and their lines on past registers are removed."
          : "The login and its records are removed. Homework they set stays with the branch."}{" "}
        To keep the history, deactivate instead.
      </p>
      <Field label={`Type "${user.name}" to confirm`}>
        <input className="input" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} />
      </Field>
    </Drawer>
  );
}

function AddStaffDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (created: { name: string; username: string; password: string }) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", branchRole: "coach" });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  async function save() {
    setSaving(true);
    try {
      const data = await api<{ username: string; password: string }>("/api/bowbazar/staff", { method: "POST", json: form });
      toast.success(`${form.name} added.`);
      onCreated({ name: form.name, ...data });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Drawer
      title="Add staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline h-10" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Add
          </button>
        </>
      }
    >
      <Field label="Name *">
        <input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <Field label="Email *">
        <input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} />
      </Field>
      <Field label="Phone">
        <input className="input" inputMode="tel" value={form.phone} onChange={(event) => set({ phone: event.target.value })} />
      </Field>
      <Field label="Role">
        <select className="input" value={form.branchRole} onChange={(event) => set({ branchRole: event.target.value })}>
          <option value="coach">Coach: attendance and homework</option>
          <option value="manager">Manager: also students, slots, fees and admissions</option>
        </select>
      </Field>
    </Drawer>
  );
}
