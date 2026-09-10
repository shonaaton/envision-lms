"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { toast } from "sonner";

type TransferBatch = {
  _id: string;
  name: string;
  level?: string;
  capacity?: number;
  studentCount?: number;
};

type TransferStudent = {
  _id: string;
  name: string;
  username?: string;
  batches?: Array<{ _id: string; name: string }>;
};

export default function ChangeBatchModal({
  student,
  onClose,
  onDone,
}: {
  student: { _id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [batches, setBatches] = useState<TransferBatch[]>([]);
  const [detail, setDetail] = useState<TransferStudent | null>(null);
  const [fromBatch, setFromBatch] = useState("");
  const [toBatch, setToBatch] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/students/transfer-batch?student=${student._id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { batches: [], student: null }))
      .then((data) => {
        setBatches(data.batches || []);
        setDetail(data.student || null);
        const current = data.student?.batches || [];
        if (current.length === 1) setFromBatch(current[0]._id);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [student._id]);

  const currentBatches = useMemo(() => detail?.batches || [], [detail]);
  const targetOptions = useMemo(
    () => batches.filter((batch) => !currentBatches.some((current) => current._id === batch._id)),
    [batches, currentBatches],
  );
  const target = targetOptions.find((batch) => batch._id === toBatch);
  const targetIsFull = Boolean(target && target.capacity && (target.studentCount || 0) >= target.capacity);

  async function submit() {
    if (!toBatch) return toast.error("Choose the batch to move them into.");
    if (currentBatches.length > 1 && !fromBatch) return toast.error("Choose which batch they are leaving.");
    setSaving(true);
    const response = await fetch("/api/admin/students/transfer-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student: student._id, fromBatch: fromBatch || undefined, toBatch, reason }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not move this student.");
    toast.success(
      `${data.studentName} moved to ${data.toBatchName}. ${data.classroomsJoined} classroom(s) opened up, ${data.classroomsClosed} closed off from today.`,
    );
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="mt-10 w-full max-w-xl rounded-2xl border border-brand/10 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Change batch</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {student.name} keeps every class and homework they were given up to today, and from now on sees only the
              new batch. Nothing already marked on their attendance or submitted by them is changed.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading batches...</div>
        ) : (
          <div className="space-y-3">
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Leaving</span>
                {currentBatches.length > 1 ? (
                  <select className="input" value={fromBatch} onChange={(event) => setFromBatch(event.target.value)}>
                    <option value="">Select a batch</option>
                    {currentBatches.map((batch) => (
                      <option key={batch._id} value={batch._id}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="input flex items-center bg-slate-50 font-semibold">
                    {currentBatches[0]?.name || "No batch yet"}
                  </div>
                )}
              </label>
              <ArrowRight size={18} className="mx-auto hidden shrink-0 text-slate-400 sm:block" />
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Joining</span>
                <select className="input" value={toBatch} onChange={(event) => setToBatch(event.target.value)}>
                  <option value="">Select a batch</option>
                  {targetOptions.map((batch) => (
                    <option key={batch._id} value={batch._id}>
                      {batch.name} ({batch.studentCount || 0}/{batch.capacity ?? 8})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {targetIsFull && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {target?.name} is already at its seat count. The move will still go through - raise the seats on the
                batch if this is meant to be permanent.
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Reason (optional)
              </span>
              <input
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Timing clash, level change, parent request..."
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn border border-slate-200" type="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary" type="button" onClick={submit} disabled={saving || !toBatch}>
                {saving ? "Moving..." : "Move student"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
