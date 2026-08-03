"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  CircleUserRound,
  Globe2,
  ContactRound,
  ImageUp,
  KeyRound,
  LockKeyhole,
  MapPin,
  Mail,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

type Gender = "male" | "female" | "other" | "not_available";

export type ProfileData = {
  name: string;
  username: string;
  email: string;
  phone: string;
  role: "student" | "instructor" | "admin" | "sub-admin";
  accountStatus: string;
  city: string;
  country: string;
  gender: Gender;
  avatar: string;
  fideId: string;
  rating: number;
  studentLevel: string;
  parentName: string;
};

type EditableProfile = Pick<ProfileData, "city" | "country" | "gender" | "avatar" | "fideId">;

const avatarColours = ["#5a1372", "#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777"];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lockedValue(value: string | number | undefined) {
  if (value === undefined || value === "" || value === 0) return "Not provided";
  return String(value);
}

function LockedField({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</label>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"><LockKeyhole size={11} /> Locked</span>
      </div>
      <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600" aria-label={`${label}, read only`}>
        {lockedValue(value)}
      </div>
    </div>
  );
}

export default function ProfileEditor({ initialProfile, permissions }: { initialProfile: ProfileData; permissions: { edit: boolean; security: boolean } }) {
  const initialEditable = useMemo<EditableProfile>(() => ({
    city: initialProfile.city,
    country: initialProfile.country,
    gender: initialProfile.gender,
    avatar: initialProfile.avatar,
    fideId: initialProfile.fideId,
  }), [initialProfile]);
  const [saved, setSaved] = useState(initialEditable);
  const [form, setForm] = useState(initialEditable);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const isStudent = initialProfile.role === "student";
  const roleLabel = initialProfile.role === "instructor" ? "Coach" : initialProfile.role === "sub-admin" ? "Sub Admin" : titleCase(initialProfile.role);
  const avatarIsImage = form.avatar.startsWith("/images/profiles/");

  function update<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.city,
          country: form.country,
          gender: form.gender,
          fideId: form.fideId,
          ...(form.avatar.startsWith("#") ? { avatar: form.avatar } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Your profile could not be saved.");
        return;
      }
      const next = { ...form, ...(data.profile || {}) } as EditableProfile;
      setForm(next);
      setSaved(next);
      toast.success("Profile updated");
    } catch {
      toast.error("Your profile could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Use a JPG, PNG, or WEBP image.");
    if (file.size > 500 * 1024) return toast.error("Profile image must be 500 KB or smaller.");

    setUploadingAvatar(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Profile image could not be uploaded.");
      setForm((current) => ({ ...current, avatar: data.avatar }));
      setSaved((current) => ({ ...current, avatar: data.avatar }));
      toast.success("Profile image updated");
    } catch {
      toast.error("Profile image could not be uploaded. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changingPassword) return;
    if (passwords.newPassword.length < 8) return toast.error("New password must be at least 8 characters.");
    if (passwords.newPassword !== passwords.confirmPassword) return toast.error("New passwords do not match.");

    setChangingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Password could not be changed.");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password changed successfully");
    } catch {
      toast.error("Password could not be changed. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function requestPasswordReset() {
    if (sendingReset) return;
    setSendingReset(true);
    try {
      const response = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: initialProfile.email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || "Reset email could not be sent.");
      toast.success(data.message || "Password reset link sent to your email.");
    } catch {
      toast.error("Reset email could not be sent. Please try again.");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="overflow-hidden rounded-lg border border-brand/15 bg-[linear-gradient(125deg,#451059_0%,#5a1372_58%,#7b2a91_100%)] px-4 py-5 text-white shadow-xl shadow-brand-900/15 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent ring-1 ring-white/15">
              <CircleUserRound size={14} /> My account
            </div>
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">Profile & security</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/75">Update your profile image and personal details, change your password, or request a secure reset link.</p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-lg bg-accent px-3 py-2 text-sm font-black text-brand shadow-lg sm:self-auto">
            <ShieldCheck size={18} /> Protected account
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="card overflow-hidden p-0 xl:sticky xl:top-4">
            <div className="h-24 bg-[linear-gradient(135deg,#f5edf8_0%,#fef5b8_100%)]" />
            <div className="px-5 pb-5 text-center">
              <div
                className="mx-auto -mt-12 grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-cover bg-center text-2xl font-black text-white shadow-xl"
                style={avatarIsImage ? { backgroundImage: `url(${form.avatar})` } : { backgroundColor: form.avatar }}
                aria-label={`${initialProfile.name} profile image`}
              >
                {!avatarIsImage && initials(initialProfile.name)}
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-950">{initialProfile.name}</h2>
              <p className="mt-1 text-sm font-semibold capitalize text-brand">{roleLabel}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="chip"><BadgeCheck size={13} /> {titleCase(initialProfile.accountStatus)}</span>
                {initialProfile.rating > 0 && <span className="chip-accent">Rating {initialProfile.rating}</span>}
              </div>
              <input ref={avatarInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-outline" disabled={uploadingAvatar || !permissions.edit} onClick={() => avatarInputRef.current?.click()}>
                  <ImageUp size={16} /> {uploadingAvatar ? "Uploading…" : avatarIsImage ? "Replace photo" : "Upload photo"}
                </button>
                {avatarIsImage && permissions.edit && (
                  <button type="button" className="btn-ghost text-red-700" onClick={() => update("avatar", "#5a1372")}>
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-500">JPG, PNG, or WEBP · maximum 500 KB</p>
              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-left text-xs leading-5 text-slate-600">
                <div className="flex gap-2"><Sparkles size={15} className="mt-0.5 shrink-0 text-brand" /><span>Your photo and personal chess details are visible here. Official identity and contact details remain managed by the academy.</span></div>
              </div>
            </div>
          </section>
        </aside>

        <div className="space-y-5">
        <form onSubmit={submit} className="space-y-5">
          <section className="card">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><LockKeyhole size={19} /></span>
              <div>
                <h2 className="font-black text-slate-950">Account details</h2>
                <p className="mt-0.5 text-sm text-slate-500">These details are read-only. Contact the academy if a correction is needed.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LockedField label="Full name" value={initialProfile.name} />
              <LockedField label="Username" value={initialProfile.username} />
              <LockedField label="Email address" value={initialProfile.email} />
              <LockedField label="Phone number" value={initialProfile.phone} />
              {isStudent && <LockedField label="Student level" value={titleCase(initialProfile.studentLevel)} />}
              {isStudent && initialProfile.parentName && <LockedField label="Parent / guardian" value={initialProfile.parentName} />}
              <LockedField label="Role" value={roleLabel} />
              <LockedField label="Rating" value={initialProfile.rating || "Not rated"} />
            </div>
          </section>

          <section className="card">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ContactRound size={19} /></span>
              <div>
                <h2 className="font-black text-slate-950">Personal profile</h2>
                <p className="mt-0.5 text-sm text-slate-500">You can update these details at any time.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><MapPin size={13} /> City</span>
                <input className="input" value={form.city} maxLength={80} disabled={!permissions.edit} onChange={(event) => update("city", event.target.value)} placeholder="Your city" autoComplete="address-level2" />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><Globe2 size={13} /> Country</span>
                <input className="input" value={form.country} maxLength={80} disabled={!permissions.edit} onChange={(event) => update("country", event.target.value)} placeholder="Your country" autoComplete="country-name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Gender</span>
                <select className="input" value={form.gender} disabled={!permissions.edit} onChange={(event) => update("gender", event.target.value as Gender)}>
                  <option value="not_available">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">FIDE ID</span>
                <input className="input" value={form.fideId} maxLength={20} inputMode="numeric" disabled={!permissions.edit} onChange={(event) => update("fideId", event.target.value.replace(/\D/g, ""))} placeholder="Optional" />
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Profile colour</legend>
              <p className="mt-1 text-xs text-slate-500">Choose the colour used for your initials when no photo is selected.</p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {avatarColours.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    disabled={!permissions.edit}
                    onClick={() => update("avatar", colour)}
                    className="grid h-11 w-11 place-items-center rounded-full border-4 border-white shadow-md ring-2 transition hover:scale-105"
                    style={{ backgroundColor: colour, boxShadow: form.avatar === colour ? `0 0 0 3px ${colour}` : undefined }}
                    aria-label={`Use ${colour} as profile colour`}
                    aria-pressed={form.avatar === colour}
                  >
                    {form.avatar === colour && <Check size={18} className="text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          {permissions.edit && <div className="sticky bottom-3 flex flex-col-reverse gap-2 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">{changed ? "You have unsaved changes." : "Your profile is up to date."}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-outline flex-1 sm:flex-none" disabled={!changed || saving} onClick={() => setForm(saved)}><RotateCcw size={16} /> Reset</button>
              <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={!changed || saving}><Save size={16} /> {saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>}
        </form>

          {permissions.security && <section className="card">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><KeyRound size={19} /></span>
              <div>
                <h2 className="font-black text-slate-950">Password & security</h2>
                <p className="mt-0.5 text-sm text-slate-500">Change your password with the current one, or request a reset link by email.</p>
              </div>
            </div>

            <form onSubmit={changePassword} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Current password</span>
                <input className="input" type="password" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" required />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">New password</span>
                  <input className="input" type="password" minLength={8} maxLength={72} value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" required />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Confirm new password</span>
                  <input className="input" type="password" minLength={8} maxLength={72} value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" required />
                </label>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" className="btn-ghost justify-start px-0 text-brand sm:px-3" disabled={sendingReset} onClick={requestPasswordReset}>
                  <Mail size={16} /> {sendingReset ? "Sending reset link…" : "Email me a reset link"}
                </button>
                <button type="submit" className="btn-primary" disabled={changingPassword}>
                  <KeyRound size={16} /> {changingPassword ? "Changing…" : "Change password"}
                </button>
              </div>
            </form>
          </section>}
        </div>
      </div>
    </div>
  );
}
