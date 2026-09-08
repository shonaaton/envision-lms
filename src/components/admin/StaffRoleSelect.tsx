"use client";
import { useEffect, useState } from "react";
import type { NamedRole } from "@/lib/accessRolePolicy";

export default function StaffRoleSelect({ defaultValue = "sub-admin" }: { defaultValue?: string }) {
  const [roles, setRoles] = useState<NamedRole[]>([]);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/roles", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (active) { setRoles(data.roles); setState(data.canManage ? "ready" : "readonly"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  if (state === "readonly") return <p className="text-xs text-slate-500">Role assignment requires a Super Admin.</p>;
  return <label className="block text-xs font-semibold">Role
    <select required name="staffRole" defaultValue={defaultValue} disabled={state !== "ready"} className="input mt-1">
      <option value="sub-admin">Sub Admin (built-in)</option><option value="admin">Admin (built-in)</option>
      {!roles.some(role => role._id === defaultValue) && !["admin", "sub-admin"].includes(defaultValue) && <option value={defaultValue}>Current role</option>}
      {roles.map(role => <option key={role._id} value={role._id} disabled={!role.isActive}>{role.name}{!role.isActive ? " (inactive)" : ""}</option>)}
    </select>
    {state === "loading" && <span className="text-slate-500">Loading roles…</span>}
    {state === "error" && <span className="text-red-600">Could not load roles. Close and reopen this form to retry.</span>}
  </label>;
}
