"use client";
import { useState } from "react";
import { toast } from "sonner";

export default function AddUserModal({
  open,
  onClose,
  onCreated,
  defaultRole,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultRole: "student" | "instructor" | "admin";
}) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone") || undefined,
      role: defaultRole,
      fideId: fd.get("fideId") || undefined,
      rating: Number(fd.get("rating") || 0),
      tags: (fd.get("tags") as string || "").split(",").map((s) => s.trim()).filter(Boolean),
      notes: fd.get("notes") || undefined,
      password: fd.get("password") || undefined,
    };
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "Failed");
    if (data.tempPassword) {
      toast.success(`${data.username} created. Temp password: ${data.tempPassword}`, { duration: 6000 });
    } else {
      toast.success(`${data.username} created`, { duration: 3500 });
    }
    onCreated();
    onClose();
  }

  const label = defaultRole === "instructor" ? "Coach" : defaultRole === "admin" ? "Admin" : "Student";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-semibold text-white">Add {label}</h2>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" name="name" placeholder="Full name *" required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" name="email" type="email" placeholder="Email *" required />
            <input className="input" name="phone" placeholder="Phone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" name="fideId" placeholder="FIDE ID (optional)" />
            <input className="input" name="rating" type="number" placeholder="Rating" />
          </div>
          <input className="input" name="tags" placeholder="Tags (comma separated)" />
          <input className="input" name="password" placeholder="Password (optional, auto-generated if empty)" />
          <textarea className="input min-h-[60px]" name="notes" placeholder="Internal notes (optional)" />
          <p className="text-xs text-gray-400">
            A username (like Name@ENV) and temporary password are auto-generated. You&apos;ll see the password in the success toast.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={loading}>{loading ? "Creating..." : `Create ${label}`}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
