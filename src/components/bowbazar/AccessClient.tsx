"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { BranchHeader, api } from "./shared";

type Role = "manager" | "coach";
type Access = Record<Role, string[]>;

/** What each switch opens. "view", user management and the activity log are not offered: view is always on, the other two stay with the admin. */
const FEATURES: { key: string; label: string; detail: string }[] = [
  { key: "attendance", label: "Attendance", detail: "Take registers, write topics, set homework" },
  { key: "students", label: "Students & admissions", detail: "Add and edit students, admissions, time changes, waitlist" },
  { key: "slots", label: "Slots", detail: "Add and change class times and seats" },
  { key: "fees", label: "Fees & settings", detail: "Bills, payments, receipts, reminders, branch settings" },
  { key: "messages", label: "Messages & holidays", detail: "Announcements, holidays, pop-ups, notifications log" },
  { key: "exams", label: "Exams", detail: "Assign exams and see results" },
  { key: "achievements", label: "Achievements", detail: "Record students' results" },
  { key: "whatsapp", label: "WhatsApp", detail: "Read and reply to families" },
];

export default function AccessClient({ can }: { can: string[] }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [defaults, setDefaults] = useState<Access | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ roleAccess: Access; defaults: Access }>("/api/bowbazar/access")
      .then((data) => {
        setAccess(data.roleAccess);
        setDefaults(data.defaults);
      })
      .catch((error) => toast.error(error.message));
  }, []);

  function toggle(role: Role, key: string) {
    if (!access) return;
    const list = access[role].includes(key) ? access[role].filter((value) => value !== key) : [...access[role], key];
    setAccess({ ...access, [role]: list });
  }

  async function save(next = access) {
    if (!next) return;
    setSaving(true);
    try {
      const data = await api<{ roleAccess: Access }>("/api/bowbazar/access", { method: "PUT", json: next });
      setAccess(data.roleAccess);
      toast.success("Saved. It applies the next time they open a page.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Feature access"
        subtitle="Choose what the Bowbazar manager and coaches can open. You, the branch admin, always have everything."
        can={can}
        actions={
          <>
            {defaults && (
              <button type="button" className="btn-outline h-10" disabled={saving} onClick={() => void save(defaults)}>
                <RotateCcw size={15} /> Defaults
              </button>
            )}
            <button type="button" className="btn-primary h-10" disabled={saving || !access} onClick={() => void save()}>
              {saving && <Loader2 size={16} className="animate-spin" />} Save
            </button>
          </>
        }
      />
      {!access ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Feature</th><th className="px-4 py-2 text-center">Manager</th><th className="px-4 py-2 text-center">Coach</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="text-slate-500">
                <td className="px-4 py-2.5"><div className="font-semibold">Overview, slots board, student list, tournaments, teaching tools</div><div className="text-xs">Always on</div></td>
                <td className="px-4 py-2.5 text-center">✓</td>
                <td className="px-4 py-2.5 text-center">✓</td>
              </tr>
              {FEATURES.map((feature) => (
                <tr key={feature.key}>
                  <td className="px-4 py-2.5"><div className="font-semibold text-slate-900">{feature.label}</div><div className="text-xs text-slate-500">{feature.detail}</div></td>
                  {(["manager", "coach"] as const).map((role) => (
                    <td key={role} className="px-4 py-2.5 text-center">
                      <input type="checkbox" className="h-4 w-4" checked={access[role].includes(feature.key)} onChange={() => toggle(role, feature.key)} aria-label={`${feature.label} for ${role}s`} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="text-slate-500">
                <td className="px-4 py-2.5"><div className="font-semibold">Users, feature access, activity tracker</div><div className="text-xs">Only the branch admin</div></td>
                <td className="px-4 py-2.5 text-center">–</td>
                <td className="px-4 py-2.5 text-center">–</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
