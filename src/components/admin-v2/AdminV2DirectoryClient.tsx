"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Edit3, Eye, KeyRound, MoreHorizontal, Plus, Search, Trash2, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Modal, AdminV2Sheet, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type UserRole = "student" | "instructor" | "admin" | "sub-admin";
type DirectoryUser = {
  _id: string;
  username?: string;
  tempPassword?: string;
  name: string;
  email: string;
  countryCode?: string;
  phone?: string;
  role: UserRole;
  batches?: Array<{ _id: string; name: string }>;
  notes?: string;
  isActive: boolean;
};

type BatchItem = {
  _id: string;
  name: string;
  level?: string;
  coach?: DirectoryUser;
  students?: DirectoryUser[];
};

const roleOptions: Array<{ value: UserRole | ""; label: string }> = [
  { value: "", label: "All roles" },
  { value: "student", label: "Students" },
  { value: "instructor", label: "Coaches" },
  { value: "sub-admin", label: "Sub-admins" },
  { value: "admin", label: "Admins" },
];

function roleLabel(role: UserRole) {
  if (role === "instructor") return "Coach";
  if (role === "sub-admin") return "Sub-admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function AdminV2DirectoryClient() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuUserId, setMenuUserId] = useState("");
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [tempCredentials, setTempCredentials] = useState("");

  async function load() {
    setLoading(true);
    const roles: UserRole[] = ["student", "instructor", "sub-admin", "admin"];
    const [userLists, batchResponse] = await Promise.all([
      Promise.all(roles.map((item) => fetch(`/api/admin/users?role=${item}`, { cache: "no-store" }).then((res) => res.ok ? res.json() : []))),
      fetch("/api/admin/batches", { cache: "no-store" }),
    ]);
    setUsers(userLists.flat());
    setBatches(batchResponse.ok ? await batchResponse.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const batchNames = (user.batches || []).map((batch) => batch.name).join(" ");
      if (role && user.role !== role) return false;
      if (batchId && !(user.batches || []).some((batch) => batch._id === batchId)) return false;
      if (!q) return true;
      return [user.name, user.email, user.username, roleLabel(user.role), batchNames].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [batchId, query, role, users]);

  const stats = {
    total: users.length,
    active: users.filter((user) => user.isActive).length,
    batches: batches.length,
  };

  async function updateUser(userId: string, payload: Partial<DirectoryUser> & { resetPassword?: boolean }) {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Could not update user");
      return null;
    }
    if (data.tempPassword) setTempCredentials(`Username: ${data.username || ""}\nTemporary Password: ${data.tempPassword}`);
    toast.success(payload.resetPassword ? "Temporary password generated" : "User updated");
    await load();
    return data;
  }

  async function deleteUser(user: DirectoryUser) {
    const confirmName = window.prompt(`Type ${user.name} to permanently delete this user.`);
    if (confirmName !== user.name) return;
    const response = await fetch(`/api/admin/users/${user._id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not delete user");
    toast.success("User permanently deleted");
    await load();
  }

  function exportUsers() {
    downloadCsv("admin-v2-directory-users.csv", [
      ["Name", "Role", "Email", "Username", "Batches", "Status"],
      ...filtered.map((user) => [user.name, roleLabel(user.role), user.email, user.username || "", (user.batches || []).map((batch) => batch.name).join("; "), user.isActive ? "Active" : "Inactive"]),
    ]);
  }

  function copyTempCredentials() {
    if (!tempCredentials) return toast.info("Reset a password first to generate temporary credentials.");
    navigator.clipboard?.writeText(tempCredentials);
    toast.success("Temporary credentials copied");
  }

  return (
    <div className="space-y-5">
      <AdminV2Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Directory</div>
            <h2 className="mt-1 text-2xl font-black text-brand">Users, Roles & Batches</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AdminV2Stat label="Users" value={stats.total} />
            <AdminV2Stat label="Active" value={stats.active} />
            <AdminV2Stat label="Batches" value={stats.batches} tone="accent" />
          </div>
        </div>
        <div className="mt-5 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto_auto_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-11 pl-10" placeholder="Search name, email, username" />
          </label>
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole | "")} className="input h-11">
            {roleOptions.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}
          </select>
          <select value={batchId} onChange={(event) => setBatchId(event.target.value)} className="input h-11">
            <option value="">All batches</option>
            {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
          </select>
          <button onClick={() => setAddingUser(true)} className="btn-primary h-11"><Plus size={16} /> Add User</button>
          <button onClick={() => setCreatingBatch(true)} className="btn-outline h-11"><Users size={16} /> Create Batch</button>
          <button onClick={exportUsers} className="btn-outline h-11"><Download size={16} /> Export</button>
        </div>
      </AdminV2Card>

      <AdminV2Card className="overflow-visible p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Current Batch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const primaryBatch = user.batches?.[0];
                const assignedBatch = primaryBatch ? batches.find((batch) => batch._id === primaryBatch._id) : null;
                return (
                  <tr key={user._id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="group relative w-fit">
                        <button onClick={() => setEditingUser(user)} className="font-black text-slate-950 hover:text-brand">{user.name}</button>
                        <div className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-2xl border border-brand/10 bg-white p-4 text-xs shadow-xl shadow-brand/15 group-hover:block">
                          <div className="font-black text-brand">Quick profile</div>
                          <div className="mt-2 space-y-1 text-slate-600">
                            <div>Coach: {assignedBatch?.coach?.name || "Not assigned"}</div>
                            <div>Batch: {primaryBatch?.name || "No batch"}</div>
                            <div>Recent attendance: Not calculated in this pilot fetch</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">{roleLabel(user.role)}</td>
                    <td className="px-4 py-3">{primaryBatch?.name || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{user.isActive ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="relative px-4 py-3 text-right">
                      <button onClick={() => setMenuUserId(menuUserId === user._id ? "" : user._id)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-brand/30 hover:text-brand">
                        <MoreHorizontal size={17} />
                      </button>
                      {menuUserId === user._id ? (
                        <div className="absolute right-4 top-12 z-30 w-56 rounded-2xl border border-brand/10 bg-white p-2 text-left shadow-xl shadow-brand/15">
                          <MenuButton icon={<Edit3 size={15} />} onClick={() => { setEditingUser(user); setMenuUserId(""); }}>Edit Profile</MenuButton>
                          <MenuButton icon={<KeyRound size={15} />} onClick={() => void updateUser(user._id, { resetPassword: true })}>Reset Password</MenuButton>
                          <MenuButton icon={<Copy size={15} />} onClick={copyTempCredentials}>Copy Temporary Credentials</MenuButton>
                          <MenuButton icon={<UserMinus size={15} />} onClick={() => void updateUser(user._id, { isActive: !user.isActive })}>{user.isActive ? "Deactivate Access" : "Reactivate Access"}</MenuButton>
                          <MenuButton danger icon={<Trash2 size={15} />} onClick={() => void deleteUser(user)}>Permanently Delete</MenuButton>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No users match the current filters.</td></tr> : null}
              {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Loading directory...</td></tr> : null}
            </tbody>
          </table>
        </div>
      </AdminV2Card>

      <UserSheet user={editingUser} batches={batches} onClose={() => setEditingUser(null)} onSave={updateUser} onCopy={copyTempCredentials} />
      <AddUserModal open={addingUser} batches={batches} onClose={() => setAddingUser(false)} onCreated={load} />
      <CreateBatchModal open={creatingBatch} coaches={users.filter((user) => user.role === "instructor")} onClose={() => setCreatingBatch(false)} onCreated={load} />
    </div>
  );
}

function MenuButton({ children, icon, onClick, danger = false }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand/5", danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:text-brand")}>
      {icon}{children}
    </button>
  );
}

function UserSheet({
  user,
  batches,
  onClose,
  onSave,
  onCopy,
}: {
  user: DirectoryUser | null;
  batches: BatchItem[];
  onClose: () => void;
  onSave: (userId: string, payload: Partial<DirectoryUser> & { resetPassword?: boolean }) => Promise<any>;
  onCopy: () => void;
}) {
  const [draft, setDraft] = useState<Partial<DirectoryUser>>({});
  useEffect(() => {
    setDraft(user ? { ...user, batches: user.batches || [] } : {});
  }, [user]);
  const selectedBatch = draft.batches?.[0]?._id || "";
  return (
    <AdminV2Sheet open={!!user} title="Edit Profile" description={user?.email} onClose={onClose}>
      {user ? (
        <div className="space-y-4">
          <input className="input" value={draft.name || ""} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
          <input className="input" value={draft.email || ""} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
          <select className="input" value={selectedBatch} onChange={(event) => setDraft((current) => ({ ...current, batches: event.target.value ? [{ _id: event.target.value, name: batches.find((batch) => batch._id === event.target.value)?.name || "" }] : [] }))}>
            <option value="">No batch</option>
            {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
          </select>
          <textarea className="input min-h-28" value={draft.notes || ""} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Admin notes" />
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button className="btn-primary" onClick={() => void onSave(user._id, { name: draft.name, email: draft.email, notes: draft.notes, batches: selectedBatch ? [selectedBatch as any] : [] }).then(onClose)}>
              <Edit3 size={16} /> Save Changes
            </button>
            <button className="btn-outline" onClick={() => void onSave(user._id, { resetPassword: true })}><KeyRound size={16} /> Reset Password</button>
            <button className="btn-outline" onClick={onCopy}><Copy size={16} /> Copy Temp Credentials</button>
          </div>
        </div>
      ) : null}
    </AdminV2Sheet>
  );
}

function AddUserModal({ open, batches, onClose, onCreated }: { open: boolean; batches: BatchItem[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState({ name: "", email: "", role: "student" as UserRole, batch: "" });
  async function create() {
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, email: draft.email, role: draft.role, batches: draft.batch ? [draft.batch] : [] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not create user");
    toast.success("User created");
    if (data.tempPassword) navigator.clipboard?.writeText(`Username: ${data.username || ""}\nTemporary Password: ${data.tempPassword}`);
    setDraft({ name: "", email: "", role: "student", batch: "" });
    onClose();
    await onCreated();
  }
  return (
    <AdminV2Modal open={open} title="Create User" description="Adds a user through the existing admin API." onClose={onClose}>
      <div className="grid gap-3">
        <input className="input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
        <input className="input" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
        <select className="input" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as UserRole }))}>
          {roleOptions.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className="input" value={draft.batch} onChange={(event) => setDraft((current) => ({ ...current, batch: event.target.value }))}>
          <option value="">No batch</option>
          {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
        </select>
        <button className="btn-primary justify-self-start" onClick={() => void create()}><Plus size={16} /> Create User</button>
      </div>
    </AdminV2Modal>
  );
}

function CreateBatchModal({ open, coaches, onClose, onCreated }: { open: boolean; coaches: DirectoryUser[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState({ name: "", level: "beginner", coach: "" });
  async function create() {
    const response = await fetch("/api/admin/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, students: [], tags: [] }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not create batch");
    toast.success("Batch created");
    setDraft({ name: "", level: "beginner", coach: "" });
    onClose();
    await onCreated();
  }
  return (
    <AdminV2Modal open={open} title="Create Batch" onClose={onClose} size="sm">
      <div className="grid gap-3">
        <input className="input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Batch name" />
        <select className="input" value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value }))}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <select className="input" value={draft.coach} onChange={(event) => setDraft((current) => ({ ...current, coach: event.target.value }))}>
          <option value="">No coach</option>
          {coaches.map((coach) => <option key={coach._id} value={coach._id}>{coach.name}</option>)}
        </select>
        <button className="btn-primary justify-self-start" onClick={() => void create()}><Plus size={16} /> Create Batch</button>
      </div>
    </AdminV2Modal>
  );
}

