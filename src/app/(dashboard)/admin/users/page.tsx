"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, MoreVertical, Plus, Upload } from "lucide-react";
import Avatar from "@/components/admin/Avatar";
import AddUserModal from "@/components/admin/AddUserModal";
import AddBatchModal from "@/components/admin/AddBatchModal";

export const dynamic = "force-dynamic";

type Tab = "students" | "coaches" | "batches" | "roles";

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>("students");
  const [users, setUsers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [sort, setSort] = useState("newest");
  const [openUserModal, setOpenUserModal] = useState(false);
  const [openBatchModal, setOpenBatchModal] = useState(false);

  async function loadUsers() {
    if (tab !== "students" && tab !== "coaches") return;
    const role = tab === "students" ? "student" : "instructor";
    const params = new URLSearchParams({ role, sort });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    const r = await fetch("/api/admin/users?" + params);
    setUsers(await r.json());
  }

  async function loadBatches() {
    if (tab !== "batches") return;
    const r = await fetch("/api/admin/batches");
    setBatches(await r.json());
  }

  useEffect(() => { loadUsers(); loadBatches(); }, [tab, q, status, tag, sort]);

  const counts = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    return { active, inactive: users.length - active };
  }, [users]);

  const tabLabel = tab === "students" ? "Student" : tab === "coaches" ? "Coach" : "Batch";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-accent">User Management</h1>
          <p className="text-sm text-gray-400">Manage students, coaches, and organize them into batches</p>
        </div>
        <div className="flex gap-2">
          {tab === "batches" ? (
            <button className="btn-accent" onClick={() => setOpenBatchModal(true)}><Plus size={16} className="mr-1" /> Add Batch</button>
          ) : tab !== "roles" ? (
            <>
              <button className="btn-accent" onClick={() => setOpenUserModal(true)}><Plus size={16} className="mr-1" /> Add {tabLabel}</button>
              <button className="btn-outline"><Upload size={16} className="mr-1" /> Import / Export</button>
            </>
          ) : null}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-ink-700 p-1">
            {(["students", "coaches", "batches", "roles"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-ink-900 text-white" : "text-gray-400 hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            {(tab === "students" || tab === "coaches") && (
              <>
                <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Filter by status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <input className="input max-w-[160px]" placeholder="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} />
                <select className="input max-w-[140px]" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="name">Name</option>
                </select>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className="input pl-9" placeholder={`Search ${tab}...`} value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>

        {(tab === "students" || tab === "coaches") && (
          <>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-emerald-300">Active {counts.active}</span>
              <span className="rounded-full bg-red-900/40 px-3 py-1 text-red-300">Inactive {counts.inactive}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500">
                  <tr className="border-b border-ink-700">
                    <th className="py-3 text-left">S.No</th>
                    <th className="py-3 text-left">Username</th>
                    <th className="py-3 text-left">Name</th>
                    <th className="py-3 text-left">Tags</th>
                    <th className="py-3 text-left">Email</th>
                    <th className="py-3 text-left">Contact No.</th>
                    <th className="py-3 text-left">Status</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u._id} className="border-b border-ink-700/50 hover:bg-white/5">
                      <td className="py-3 text-gray-500">{i + 1}</td>
                      <td className="py-3 font-semibold text-accent">{u.username}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={u.name} />
                          <span className="text-white">{u.name}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        {(u.tags || []).map((t: string) => (
                          <span key={t} className="chip mr-1">{t}</span>
                        ))}
                      </td>
                      <td className="py-3 text-gray-300">{u.email}</td>
                      <td className="py-3 text-gray-300">{u.phone || "—"}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs ${u.isActive ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button className="rounded p-1 hover:bg-white/10"><MoreVertical size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-gray-500">No {tab} yet. Click "Add {tabLabel}" to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "batches" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {batches.map((b) => (
              <div key={b._id} className="card-hover">
                <div className="flex items-start justify-between">
                  <div className="text-white font-semibold">{b.name}</div>
                  <span className="chip">{b.level}</span>
                </div>
                {b.description && <p className="mt-1 text-sm text-gray-400">{b.description}</p>}
                <div className="mt-2 text-xs text-gray-500">
                  Coach: {b.coach?.name || "—"} • {(b.students?.length ?? 0)} students
                </div>
              </div>
            ))}
            {batches.length === 0 && <div className="text-sm text-gray-400">No batches yet.</div>}
          </div>
        )}

        {tab === "roles" && (
          <div className="card text-sm text-gray-300">
            <div className="mb-2 font-semibold text-white">Built-in roles</div>
            <ul className="space-y-1">
              <li><span className="chip">student</span> — can view their classrooms, homework, and pay fees</li>
              <li><span className="chip">instructor</span> — can manage classrooms, homework, attendance, availability</li>
              <li><span className="chip">admin</span> — full access including user management</li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">Custom roles coming in v2.</p>
          </div>
        )}
      </div>

      <AddUserModal
        open={openUserModal}
        onClose={() => setOpenUserModal(false)}
        onCreated={loadUsers}
        defaultRole={tab === "coaches" ? "instructor" : "student"}
      />
      <AddBatchModal open={openBatchModal} onClose={() => setOpenBatchModal(false)} onCreated={loadBatches} />
    </div>
  );
}
