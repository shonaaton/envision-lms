"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  Edit,
  Eye,
  FileText,
  KeyRound,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/admin/Avatar";
import AddUserModal from "@/components/admin/AddUserModal";
import AddBatchModal from "@/components/admin/AddBatchModal";

export const dynamic = "force-dynamic";

type Tab = "students" | "coaches" | "batches" | "roles";
type UserRole = "student" | "instructor" | "admin";

type AdminUser = {
  _id: string;
  username?: string;
  tempPassword?: string;
  passwordChangedAt?: string;
  passwordChangeSource?: "registration" | "admin_reset" | "self_reset";
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  tags?: string[];
  batches?: Array<{ _id: string; name: string }>;
  fideId?: string;
  rating?: number;
  notes?: string;
  isActive: boolean;
};

type BatchItem = {
  _id: string;
  name: string;
  description?: string;
  level?: string;
  coach?: AdminUser;
  students?: AdminUser[];
  tags?: string[];
};

type BatchUpdatePayload = {
  name?: string;
  description?: string;
  level?: string;
  coach?: string;
  students?: string[];
};

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>("students");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allStudents, setAllStudents] = useState<AdminUser[]>([]);
  const [allCoaches, setAllCoaches] = useState<AdminUser[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [sort, setSort] = useState("newest");
  const [openUserModal, setOpenUserModal] = useState(false);
  const [openBatchModal, setOpenBatchModal] = useState(false);
  const [menu, setMenu] = useState<{ type: "user" | "batch"; id: string } | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [reportUser, setReportUser] = useState<AdminUser | null>(null);
  const [assignCoach, setAssignCoach] = useState<AdminUser | null>(null);
  const [detailBatch, setDetailBatch] = useState<BatchItem | null>(null);
  const [editBatch, setEditBatch] = useState<BatchItem | null>(null);

  const loadUsers = useCallback(async () => {
    if (tab !== "students" && tab !== "coaches") return;
    const role = tab === "students" ? "student" : "instructor";
    const params = new URLSearchParams({ role, sort });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    const response = await fetch("/api/admin/users?" + params, { cache: "no-store" });
    setUsers(await response.json());
  }, [q, sort, status, tab, tag]);

  const loadBatches = useCallback(async () => {
    const response = await fetch("/api/admin/batches");
    setBatches(await response.json());
  }, []);

  const loadDirectory = useCallback(async () => {
    const [studentsResponse, coachesResponse] = await Promise.all([
      fetch("/api/admin/users?role=student"),
      fetch("/api/admin/users?role=instructor"),
    ]);
    setAllStudents(await studentsResponse.json());
    setAllCoaches(await coachesResponse.json());
  }, []);

  useEffect(() => {
    loadUsers();
    loadBatches();
    loadDirectory();
  }, [loadBatches, loadDirectory, loadUsers]);

  useEffect(() => {
    const refresh = () => loadUsers();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [loadUsers]);

  const counts = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    return { active, inactive: users.length - active };
  }, [users]);

  const currentBatches = useMemo(() => {
    const query = q.trim().toLowerCase();
    return batches.filter((batch) => {
      if (!query) return true;
      return [batch.name, batch.coach?.name, batch.level].filter(Boolean).some((value) => value!.toLowerCase().includes(query));
    });
  }, [batches, q]);

  const tabLabel = tab === "students" ? "Student" : tab === "coaches" ? "Coach" : "Batch";
  const openMenuUser = users.find((u) => menu?.type === "user" && menu.id === u._id);
  const openMenuBatch = batches.find((b) => menu?.type === "batch" && menu.id === b._id);

  async function updateUser(id: string, payload: Partial<AdminUser> & { resetPassword?: boolean; password?: string }) {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "Could not update user");
    toast.success(payload.resetPassword ? "Password reset" : "User updated");
    await loadUsers();
    await loadBatches();
    return data;
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`Deactivate ${user.name}?`)) return;
    const response = await fetch(`/api/admin/users/${user._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not deactivate user");
    toast.success(`${user.name} deactivated`);
    setMenu(null);
    loadUsers();
  }

  async function updateBatch(id: string, payload: BatchUpdatePayload) {
    const response = await fetch(`/api/admin/batches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return toast.error("Could not update batch");
    toast.success("Batch updated");
    await loadBatches();
  }

  async function deleteBatch(batch: BatchItem) {
    if (!window.confirm(`Delete batch ${batch.name}?`)) return;
    const response = await fetch(`/api/admin/batches/${batch._id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete batch");
    toast.success("Batch deleted");
    setMenu(null);
    loadBatches();
  }

  function exportCsv() {
    const rows = tab === "batches"
      ? [["Name", "Coach", "Students", "Level"], ...currentBatches.map((b) => [b.name, b.coach?.name || "", String(b.students?.length || 0), b.level || ""])]
      : [["Username", "Password Status", "Name", "Email", "Phone", "Status"], ...users.map((u) => [u.username || "", passwordStatus(u), u.name, u.email, u.phone || "", u.isActive ? "Active" : "Inactive"])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${tab}-export.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function copyCredentials(user: AdminUser) {
    if (!user.tempPassword) {
      toast.info("The current password is securely encrypted and cannot be copied. Use Reset Password to create a new temporary password.");
      return;
    }
    navigator.clipboard?.writeText(`Username: ${user.username || ""}\nTemporary Password: ${user.tempPassword}`);
    toast.success("Credentials copied");
  }

  return (
    <div className="-m-6 min-h-screen space-y-6 bg-slate-50 p-6 text-slate-950">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl">User Management</h1>
          <p className="text-sm text-slate-500">Manage students, coaches, and organize them into batches</p>
        </div>
        <div className="flex gap-2">
          {tab === "batches" ? (
            <button className="btn-primary" onClick={() => setOpenBatchModal(true)}><Plus size={16} className="mr-1" /> Add Batch</button>
          ) : tab !== "roles" ? (
            <>
              <button className="btn-primary" onClick={() => setOpenUserModal(true)}><Plus size={16} className="mr-1" /> Add {tabLabel}</button>
              <button className="btn border border-slate-200 bg-white text-slate-700" onClick={exportCsv}><Upload size={16} className="mr-1" /> Export CSV</button>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["students", "coaches", "batches", "roles"] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setMenu(null); }} className={`rounded-md px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-white text-slate-950 shadow" : "text-slate-600"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            {(tab === "students" || tab === "coaches") && (
              <>
                <select className="input max-w-[160px] bg-white text-slate-950" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Filter by status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <input className="input max-w-[160px] bg-white text-slate-950" placeholder="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} />
                <select className="input max-w-[140px] bg-white text-slate-950" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="name">Name</option>
                </select>
              </>
            )}
            {(tab !== "roles") && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input bg-white pl-9 text-slate-950" placeholder={`Search ${tab}...`} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {(tab === "students" || tab === "coaches") && (
          <>
            <div className="mt-6 flex gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Active {counts.active}</span>
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">Inactive {counts.inactive}</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-3 text-left">S.No</th>
                    <th className="py-3 text-left">Username</th>
                    <th className="py-3 text-left">Password Status</th>
                    <th className="py-3 text-left">Name</th>
                    <th className="py-3 text-left">Email</th>
                    <th className="py-3 text-left">Contact No.</th>
                    <th className="py-3 text-left">Status</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u._id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 text-slate-500">{i + 1}</td>
                      <td className="py-3 font-semibold">{u.username}</td>
                      <td className="py-3">
                        {u.tempPassword ? (
                          <button className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800" onClick={() => copyCredentials(u)}>
                            Temporary password <Copy size={12} />
                          </button>
                        ) : (
                          <span className="inline-flex rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            {passwordStatus(u)}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <button className="flex items-center gap-2 text-left" onClick={() => setDetailUser(u)}>
                          <Avatar name={u.name} />
                          <span className="font-medium">{u.name}</span>
                        </button>
                      </td>
                      <td className="py-3 text-slate-600">{u.email}</td>
                      <td className="py-3 text-slate-600">{u.phone || "-"}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="relative py-3 text-right">
                        <button className="rounded p-1 hover:bg-slate-100" onClick={() => setMenu(menu?.id === u._id ? null : { type: "user", id: u._id })}><MoreVertical size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-500">No {tab} yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "batches" && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-3 text-left">S.No</th>
                  <th className="py-3 text-left">Name</th>
                  <th className="py-3 text-left">Coach</th>
                  <th className="py-3 text-left">Students Count</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentBatches.map((batch, index) => (
                  <tr key={batch._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 text-slate-500">{index + 1}</td>
                    <td className="py-3 font-semibold">{batch.name}</td>
                    <td className="py-3">{batch.coach?.name || "-"}</td>
                    <td className="py-3">{batch.students?.length || 0}</td>
                    <td className="relative py-3 text-right">
                      <button className="rounded p-1 hover:bg-slate-100" onClick={() => setMenu(menu?.id === batch._id ? null : { type: "batch", id: batch._id })}><MoreVertical size={16} /></button>
                    </td>
                  </tr>
                ))}
                {currentBatches.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No batches yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "roles" && <RolesPanel />}
      </div>

      {menu && openMenuUser && (
        <ActionMenu onClose={() => setMenu(null)} items={[
          { icon: Eye, label: "View Details", onClick: () => { setDetailUser(openMenuUser); setMenu(null); } },
          { icon: Edit, label: `Edit ${openMenuUser.role === "instructor" ? "Coach" : "Student"}`, onClick: () => { setEditUser(openMenuUser); setMenu(null); } },
          { icon: KeyRound, label: "Reset Password", onClick: async () => { await updateUser(openMenuUser._id, { resetPassword: true }); setMenu(null); } },
          ...(openMenuUser.role === "instructor" ? [{ icon: UserPlus, label: "Assign Students", onClick: () => { setAssignCoach(openMenuUser); setMenu(null); } }] : []),
          { icon: FileText, label: `${openMenuUser.role === "instructor" ? "Coach" : "Student"} Report`, onClick: () => { setReportUser(openMenuUser); setMenu(null); } },
          { icon: openMenuUser.isActive ? UserX : UserCheck, label: openMenuUser.isActive ? "Deactivate" : "Activate", onClick: async () => { await updateUser(openMenuUser._id, { isActive: !openMenuUser.isActive }); setMenu(null); } },
          { icon: Trash2, label: "Delete / Deactivate", onClick: () => deleteUser(openMenuUser) },
        ]} />
      )}

      {menu && openMenuBatch && (
        <ActionMenu onClose={() => setMenu(null)} items={[
          { icon: Eye, label: "View Details", onClick: () => { setDetailBatch(openMenuBatch); setMenu(null); } },
          { icon: Edit, label: "Edit Batch", onClick: () => { setEditBatch(openMenuBatch); setMenu(null); } },
          { icon: Trash2, label: "Delete Batch", onClick: () => deleteBatch(openMenuBatch) },
        ]} />
      )}

      <AddUserModal open={openUserModal} onClose={() => setOpenUserModal(false)} onCreated={loadUsers} defaultRole={tab === "coaches" ? "instructor" : "student"} />
      <AddBatchModal open={openBatchModal} onClose={() => setOpenBatchModal(false)} onCreated={loadBatches} />
      {detailUser && <UserDetailsModal user={detailUser} batches={batches} onClose={() => setDetailUser(null)} onCopy={() => copyCredentials(detailUser)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={async (payload) => { await updateUser(editUser._id, payload); setEditUser(null); }} />}
      {reportUser && <ReportModal user={reportUser} batches={batches} onClose={() => setReportUser(null)} />}
      {assignCoach && <AssignStudentsModal coach={assignCoach} students={allStudents} batches={batches} onClose={() => setAssignCoach(null)} onSave={async (batchId, students) => { await updateBatch(batchId, { students }); setAssignCoach(null); }} />}
      {detailBatch && <BatchDetailsModal batch={detailBatch} onClose={() => setDetailBatch(null)} />}
      {editBatch && <EditBatchModal batch={editBatch} coaches={allCoaches} students={allStudents} onClose={() => setEditBatch(null)} onSave={async (payload) => { await updateBatch(editBatch._id, payload); setEditBatch(null); }} />}
    </div>
  );
}

function ActionMenu({ items, onClose }: { items: Array<{ icon: any; label: string; onClick: () => void }>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute right-10 top-48 min-w-52 rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-950 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-2 font-semibold">Actions</div>
        {items.map((item) => {
          const Icon = item.icon;
          return <button key={item.label} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50" onClick={item.onClick}><Icon size={16} /> {item.label}</button>;
        })}
      </div>
    </div>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 text-slate-950 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserDetailsModal({ user, batches, onClose, onCopy }: { user: AdminUser; batches: BatchItem[]; onClose: () => void; onCopy: () => void }) {
  const assigned = batches.filter((batch) => batch.students?.some((student) => student._id === user._id));
  return (
    <ModalShell title="User Details" onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[160px_1fr]">
        <div className="flex justify-center"><Avatar name={user.name} size={112} /></div>
        <div className="space-y-3">
          <div><span className="text-2xl font-semibold">{user.name}</span> <span className="ml-2 rounded bg-brand-100 px-2 py-1 text-xs text-brand">{user.role}</span></div>
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Username" value={user.username || "-"} />
          <InfoRow label="Password" value={user.tempPassword ? "Temporary password available to admin" : passwordStatus(user)} />
          <InfoRow label="Contact No." value={user.phone || "-"} />
          <InfoRow label="Status" value={user.isActive ? "Active" : "Inactive"} />
          {user.tempPassword ? <button className="btn-primary gap-2" onClick={onCopy}><Copy size={15} /> Copy temporary credentials</button> : null}
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 p-4">
        <div className="mb-3 font-semibold">Assigned Batches</div>
        {assigned.length ? assigned.map((batch) => <div key={batch._id} className="py-1">{batch.name}</div>) : <div className="text-sm text-slate-500">No batch assigned</div>}
      </div>
    </ModalShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[120px_1fr] text-sm"><span className="text-slate-500">{label}</span><span className="font-medium">{value}</span></div>;
}

function passwordStatus(user: AdminUser) {
  if (user.tempPassword) return "Temporary password active";
  if (!user.passwordChangedAt) return "Password securely set";
  const changed = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(user.passwordChangedAt));
  return `${user.passwordChangeSource === "self_reset" ? "Updated by user" : "Updated"} ${changed}`;
}

function EditUserModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (payload: Partial<AdminUser>) => void }) {
  return (
    <ModalShell title={`Edit ${user.role === "instructor" ? "Coach" : "Student"}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({
          name: String(fd.get("name") || ""),
          email: String(fd.get("email") || ""),
          phone: String(fd.get("phone") || ""),
          tags: String(fd.get("tags") || "").split(",").map((s) => s.trim()).filter(Boolean),
          notes: String(fd.get("notes") || ""),
          isActive: fd.get("isActive") === "on",
        });
      }}>
        <input className="input bg-white text-slate-950" name="name" defaultValue={user.name} required />
        <input className="input bg-white text-slate-950" name="email" type="email" defaultValue={user.email} required />
        <input className="input bg-white text-slate-950" name="phone" defaultValue={user.phone || ""} />
        <input className="input bg-white text-slate-950" name="tags" defaultValue={(user.tags || []).join(", ")} />
        <textarea className="input min-h-24 bg-white text-slate-950" name="notes" defaultValue={user.notes || ""} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={user.isActive} /> Active</label>
        <div className="flex justify-end gap-2"><button className="btn border border-slate-200" type="button" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
      </form>
    </ModalShell>
  );
}

function ReportModal({ user, batches, onClose }: { user: AdminUser; batches: BatchItem[]; onClose: () => void }) {
  const assigned = batches.filter((batch) => batch.students?.some((student) => student._id === user._id) || batch.coach?._id === user._id);
  return (
    <ModalShell title={`${user.name} Report`} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-3">
        <ReportCard label="Role" value={user.role} />
        <ReportCard label="Status" value={user.isActive ? "Active" : "Inactive"} />
        <ReportCard label="Batches" value={String(assigned.length)} />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 p-4 text-sm">
        <div className="mb-2 font-semibold">Summary</div>
        <div>Username: {user.username}</div>
        <div>Email: {user.email}</div>
        <div>Assigned: {assigned.map((batch) => batch.name).join(", ") || "None"}</div>
      </div>
    </ModalShell>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-4"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold capitalize">{value}</div></div>;
}

function AssignStudentsModal({ coach, students, batches, onClose, onSave }: { coach: AdminUser; students: AdminUser[]; batches: BatchItem[]; onClose: () => void; onSave: (batchId: string, students: string[]) => void }) {
  const coachBatches = batches.filter((batch) => batch.coach?._id === coach._id);
  const [batchId, setBatchId] = useState(coachBatches[0]?._id || "");
  const current = batches.find((batch) => batch._id === batchId);
  const [selected, setSelected] = useState<string[]>(current?.students?.map((s) => s._id) || []);
  useEffect(() => {
    const next = batches.find((batch) => batch._id === batchId);
    setSelected(next?.students?.map((s) => s._id) || []);
  }, [batchId, batches]);
  return (
    <ModalShell title={`Assign Students to ${coach.name}`} onClose={onClose}>
      <select className="input mb-4 bg-white text-slate-950" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
        {coachBatches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
      </select>
      {!coachBatches.length && <div className="text-sm text-slate-500">No batch assigned to this coach yet. Edit a batch and choose this coach first.</div>}
      <div className="max-h-72 overflow-y-auto rounded border border-slate-200 p-3">
        {students.filter((s) => s.role === "student").map((student) => (
          <label key={student._id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={selected.includes(student._id)} onChange={() => setSelected((value) => value.includes(student._id) ? value.filter((id) => id !== student._id) : [...value, student._id])} />
            {student.name} <span className="text-slate-500">{student.username}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn border border-slate-200" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!batchId} onClick={() => onSave(batchId, selected)}>Save</button></div>
    </ModalShell>
  );
}

function BatchDetailsModal({ batch, onClose }: { batch: BatchItem; onClose: () => void }) {
  return (
    <ModalShell title="Batch Details" onClose={onClose}>
      <div className="mb-5 rounded-lg border border-slate-200 p-4">
        <div className="text-2xl font-semibold">{batch.name}</div>
        <div className="mt-1 text-sm text-slate-500">{batch.students?.length || 0} student enrolled</div>
        <div className="mt-3 text-sm">Coach: <span className="font-semibold">{batch.coach?.name || "-"}</span></div>
      </div>
      <div className="font-semibold">Enrolled Students</div>
      <div className="mt-3 rounded-lg border border-slate-200">
        {(batch.students || []).map((student, index) => (
          <div key={student._id} className="grid grid-cols-[48px_1fr_1fr] gap-3 border-b border-slate-100 p-3 text-sm last:border-b-0">
            <span>{index + 1}</span><span>{student.name}</span><span>{student.email}</span>
          </div>
        ))}
        {!batch.students?.length && <div className="p-4 text-sm text-slate-500">No students enrolled</div>}
      </div>
    </ModalShell>
  );
}

function EditBatchModal({ batch, coaches, students, onClose, onSave }: { batch: BatchItem; coaches: AdminUser[]; students: AdminUser[]; onClose: () => void; onSave: (payload: BatchUpdatePayload) => void }) {
  const [selected, setSelected] = useState<string[]>(batch.students?.map((s) => s._id) || []);
  return (
    <ModalShell title="Edit Batch" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSave({ name: String(fd.get("name") || ""), description: String(fd.get("description") || ""), level: String(fd.get("level") || "beginner"), coach: String(fd.get("coach") || ""), students: selected });
      }}>
        <input className="input bg-white text-slate-950" name="name" defaultValue={batch.name} required />
        <textarea className="input bg-white text-slate-950" name="description" defaultValue={batch.description || ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="input bg-white text-slate-950" name="coach" defaultValue={batch.coach?._id || ""}>
            <option value="">No coach</option>
            {coaches.map((coach) => <option key={coach._id} value={coach._id}>{coach.name}</option>)}
          </select>
          <select className="input bg-white text-slate-950" name="level" defaultValue={batch.level || "beginner"}>
            <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </div>
        <div className="max-h-64 overflow-y-auto rounded border border-slate-200 p-3">
          {students.map((student) => <label key={student._id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={selected.includes(student._id)} onChange={() => setSelected((value) => value.includes(student._id) ? value.filter((id) => id !== student._id) : [...value, student._id])} />{student.name}</label>)}
        </div>
        <div className="flex justify-end gap-2"><button className="btn border border-slate-200" type="button" onClick={onClose}>Cancel</button><button className="btn-primary">Save Batch</button></div>
      </form>
    </ModalShell>
  );
}

function RolesPanel() {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      {[
        ["student", "Can view assigned classes, homework, PGN library, fees, and bookings."],
        ["instructor", "Can manage classes, homework, attendance, availability, and assigned students."],
        ["admin", "Full access including user, coach, batch, billing, and settings management."],
      ].map(([role, description]) => (
        <div key={role} className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 font-semibold capitalize">{role}</div>
          <div className="text-sm text-slate-500">{description}</div>
        </div>
      ))}
    </div>
  );
}
