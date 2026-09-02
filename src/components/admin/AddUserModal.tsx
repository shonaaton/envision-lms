"use client";
import { useState } from "react";
import { toast } from "sonner";

export default function AddUserModal({
  open,
  onClose,
  onCreated,
  defaultRole,
  defaultAccountStatus,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultRole: "student" | "instructor" | "admin" | "sub-admin";
  defaultAccountStatus?: "demo" | "enrolled";
}) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") || "").trim();
    const countryCode = String(fd.get("countryCode") || "").trim();
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      countryCode: phone ? countryCode || undefined : undefined,
      phone: phone || undefined,
      role: defaultRole,
      accountStatus: defaultAccountStatus,
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
    if (data.welcomeEmailDelivered === false) {
      toast.warning(`${data.username} was created, but the welcome email could not be sent. Temp password: ${data.tempPassword}`, { duration: 9000 });
    } else if (data.tempPassword) {
      toast.success(`${data.username} created. Welcome email sent. Temp password: ${data.tempPassword}`, { duration: 7000 });
    } else {
      toast.success(`${data.username} created`, { duration: 3500 });
    }
    onCreated();
    onClose();
  }

  const label = defaultRole === "instructor" ? "Coach" : defaultRole === "admin" ? "Admin" : defaultRole === "sub-admin" ? "Sub Admin" : defaultAccountStatus === "demo" ? "Demo" : "Student";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-xl font-semibold text-slate-950">Add {label}</h2>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" name="name" placeholder="Full name *" required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" name="email" type="email" placeholder="Email *" required />
            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
              <input className="input" name="countryCode" placeholder="+91" defaultValue="+91" inputMode="tel" autoComplete="tel-country-code" />
              <input className="input" name="phone" placeholder="Phone" inputMode="tel" autoComplete="tel-national" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" name="fideId" placeholder="FIDE ID (optional)" />
            <input className="input" name="rating" type="number" placeholder="Rating" />
          </div>
          <input className="input" name="tags" placeholder="Tags (comma separated)" />
          <input className="input" name="password" placeholder="Password (optional, auto-generated if empty)" />
          <textarea className="input min-h-[60px]" name="notes" placeholder="Internal notes (optional)" />
          <p className="text-xs text-slate-500">
            A username (like Name@ENV) and temporary password are auto-generated. The user will receive them by welcome email, and you&apos;ll also see the password in the success message.
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
