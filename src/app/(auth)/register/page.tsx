"use client";

import { useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";

const countries = [
  { code: "+91", country: "India" },
  { code: "+1", country: "United States / Canada" },
  { code: "+44", country: "United Kingdom" },
  { code: "+61", country: "Australia" },
  { code: "+65", country: "Singapore" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+974", country: "Qatar" },
  { code: "+966", country: "Saudi Arabia" },
];

const countryOptions = [...countries.map((item) => item.country), "Other"];

const initialForm = {
  name: "",
  parentName: "",
  email: "",
  password: "",
  confirmPassword: "",
  countryCode: "+91",
  phone: "",
  city: "",
  country: "",
  level: "",
  coachExperience: "",
  playingLevel: "",
  fideId: "",
  rating: "",
  preferredStudents: "",
  availabilityNote: "",
  message: "",
  acceptedPrivacy: false,
  acceptedTerms: false,
  acceptedRefund: false,
  parentConsent: false,
  academyUpdates: true,
};

type FormState = typeof initialForm;
type Role = "student" | "instructor";

const journeyNotes = [
  { title: "Free assessment", detail: "Demo account and trial request.", icon: CalendarDays },
  { title: "Correct placement", detail: "Level, location, and learning context.", icon: BookOpen },
  { title: "Connected portal", detail: "Practice, homework, tournaments, reports.", icon: Target },
];

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<Role>("student");
  const [stepIndex, setStepIndex] = useState(0);
  const [applicationSent, setApplicationSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const steps = useMemo(() => {
    const commonStart = [{ id: "account", title: "Account", subtitle: "Contact details", icon: UserRound }];
    const commonEnd = [
      { id: "security", title: "Security", subtitle: "Password", icon: ShieldCheck },
      { id: "consent", title: "Review", subtitle: "Policies", icon: FileText },
    ];
    if (role === "student") {
      return [
        ...commonStart,
        { id: "profile", title: "Student Profile", subtitle: "Level and location", icon: GraduationCap },
        ...commonEnd,
      ];
    }
    return [
      ...commonStart,
      { id: "coachProfile", title: "Coach Profile", subtitle: "Playing background", icon: Trophy },
      { id: "teaching", title: "Teaching Fit", subtitle: "Experience", icon: BriefcaseBusiness },
      ...commonEnd,
    ];
  }, [role]);

  const activeStep = steps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const passwordScore = useMemo(() => {
    let score = 0;
    if (form.password.length >= 8) score += 1;
    if (/[A-Z]/.test(form.password)) score += 1;
    if (/[0-9]/.test(form.password)) score += 1;
    if (/[^A-Za-z0-9]/.test(form.password)) score += 1;
    return score;
  }, [form.password]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setStepIndex(0);
  }

  function validateCurrentStep() {
    const requireText = (value: string, message: string) => {
      if (!value.trim()) {
        toast.error(message);
        return false;
      }
      return true;
    };

    if (activeStep.id === "account") {
      if (!requireText(form.name, role === "student" ? "Please enter the student name." : "Please enter your full name.")) return false;
      if (role === "student" && !requireText(form.parentName, "Please enter the parent or guardian name.")) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        toast.error("Please enter a valid email address.");
        return false;
      }
      if (!requireText(form.countryCode, "Please enter the country code.")) return false;
      if (!requireText(form.phone, "Please enter a phone number.")) return false;
    }

    if (activeStep.id === "profile") {
      if (!requireText(form.city, "Please enter the city.")) return false;
      if (!requireText(form.country, "Please select the country.")) return false;
      if (!requireText(form.level, "Please select the current chess level.")) return false;
    }

    if (activeStep.id === "coachProfile") {
      if (!requireText(form.city, "Please enter the city.")) return false;
      if (!requireText(form.country, "Please select the country.")) return false;
      if (!requireText(form.playingLevel, "Please enter the playing or coaching level.")) return false;
    }

    if (activeStep.id === "teaching" && !requireText(form.coachExperience, "Please add coaching experience.")) return false;

    if (activeStep.id === "security") {
      if (form.password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return false;
      }
      if (form.password !== form.confirmPassword) {
        toast.error("Passwords do not match.");
        return false;
      }
    }

    if (activeStep.id === "consent") {
      if (!form.acceptedPrivacy || !form.acceptedTerms || !form.acceptedRefund) {
        toast.error("Please accept the academy policies to continue.");
        return false;
      }
      if (role === "student" && !form.parentConsent) {
        toast.error("Please confirm parent or guardian consent.");
        return false;
      }
    }

    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateCurrentStep()) return;

    setLoading(true);
    const payload = {
      name: form.name.trim(),
      parentName: form.parentName.trim(),
      email: form.email.trim(),
      password: form.password,
      role,
      countryCode: form.countryCode.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      country: form.country,
      level: form.level,
      acceptedPrivacy: form.acceptedPrivacy,
      acceptedTerms: form.acceptedTerms,
      acceptedRefund: form.acceptedRefund,
      coachExperience: form.coachExperience.trim(),
      playingLevel: form.playingLevel.trim(),
      fideId: form.fideId.trim(),
      rating: Number(form.rating || 0),
      preferredStudents: form.preferredStudents.trim(),
      availabilityNote: form.availabilityNote.trim(),
      message: form.message.trim(),
    };

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      setLoading(false);
      return toast.error(error);
    }

    const result = await res.json();
    if (result.type === "coach_application") {
      setLoading(false);
      setApplicationSent(true);
      return;
    }

    await signIn("credentials", { redirect: false, email: payload.email, password: payload.password });
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  if (applicationSent) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#12031a] p-5 text-white">
        <section className="w-full max-w-xl rounded-lg border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-accent text-brand-900">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="mt-5 text-3xl font-black">Coach application received</h1>
          <p className="mt-3 text-white/70">Thank you. The academy admin will review your application before teaching access is activated.</p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">Back to login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#12031a] text-slate-950 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(253,231,90,0.16),transparent_28%),radial-gradient(circle_at_78%_16%,rgba(129,40,160,0.32),transparent_34%),linear-gradient(135deg,#12031a_0%,#250730_46%,#09020e_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(45deg,#fff_25%,transparent_25%),linear-gradient(-45deg,#fff_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#fff_75%),linear-gradient(-45deg,transparent_75%,#fff_75%)] [background-position:0_0,0_10px,10px_-10px,-10px_0px] [background-size:20px_20px]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:h-screen lg:grid-cols-[minmax(330px,0.85fr)_minmax(620px,1.15fr)] lg:px-8">
        <aside className="register-visual-shell overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] p-6 text-white shadow-2xl shadow-black/30 backdrop-blur lg:h-[calc(100vh-40px)] lg:flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-[#1a0622] p-5 xl:p-6">
            <Image src="/images/landing/anish-bijibilla.jpg" alt="Envision Chess Academy student achievement" fill priority sizes="34vw" className="object-cover object-top opacity-22" />
            <div className="absolute inset-0 bg-[linear-gradient(155deg,#17051f_0%,rgba(43,7,55,0.92)_50%,rgba(12,3,16,0.82)_100%)]" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
              <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={270} height={92} priority unoptimized className="h-12 w-auto object-contain xl:h-16" />
              <div className="max-w-[390px]">
                <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-black uppercase text-accent">
                  <Sparkles size={14} /> Guided onboarding
                </p>
                <h1 className="mt-3 max-w-[12ch] text-[1.85rem] font-black leading-[1.02] xl:text-[2.15rem] 2xl:text-[2.3rem]">A cleaner start for every academy journey.</h1>
                <p className="mt-3 max-w-[34ch] text-xs leading-5 text-white/78">
                  Students request a demo. Coaches submit a reviewed application. Every account begins with the right context.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {journeyNotes.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-sm font-black text-brand-900">{index + 1}</span>
                  <span>
                    <span className="flex items-center gap-2 text-sm font-black text-white"><Icon size={16} /> {item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-white/60">{item.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex min-h-[calc(100vh-40px)] flex-col rounded-lg border border-white/12 bg-white p-4 shadow-2xl shadow-black/25 sm:p-5 lg:h-[calc(100vh-40px)] lg:min-h-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-brand">
                <ShieldCheck size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-brand">{role === "student" ? "Student demo onboarding" : "Coach application review"}</p>
                <h1 className="text-xl font-black leading-tight sm:text-3xl">{role === "student" ? "Create Demo Student Account" : "Submit Coach Application"}</h1>
              </div>
            </div>
            <Link href="/login" className="rounded-lg border border-brand/20 px-4 py-2 text-sm font-black text-brand transition hover:bg-brand-50">
              Sign in
            </Link>
          </div>

          <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => switchRole("student")} className={`rounded-lg px-3 py-3 text-sm font-black transition ${role === "student" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <UsersRound size={16} className="mr-2 inline" /> Student Demo
            </button>
            <button type="button" onClick={() => switchRole("instructor")} className={`rounded-lg px-3 py-3 text-sm font-black transition ${role === "instructor" ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
              <BriefcaseBusiness size={16} className="mr-2 inline" /> Coach Application
            </button>
          </div>

          <div className="mt-4 shrink-0">
            <div className="mb-3 flex items-center justify-between text-xs font-black uppercase text-slate-500">
              <span>Step {stepIndex + 1} of {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isDone = index < stepIndex;
                const isActive = index === stepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => (index <= stepIndex ? setStepIndex(index) : undefined)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-brand bg-brand text-white shadow-lg shadow-brand/20"
                        : isDone
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${isActive ? "bg-white/18" : "bg-slate-100"}`}>
                      {isDone ? <Check size={15} /> : <Icon size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black">{step.title}</span>
                      <span className="block truncate text-[11px] opacity-70">{step.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-[#fbfcff] p-4">
            <StepHeader icon={activeStep.icon} title={activeStep.title} subtitle={activeStep.subtitle} />
            {activeStep.id === "account" && (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField icon={<UserRound size={18} />} label={role === "student" ? "Student name" : "Full name"} value={form.name} onChange={(value) => setField("name", value)} autoComplete="name" />
                  {role === "student" && <TextField icon={<UsersRound size={18} />} label="Parent or guardian name" value={form.parentName} onChange={(value) => setField("parentName", value)} />}
                  <TextField icon={<Mail size={18} />} label="Email address" value={form.email} onChange={(value) => setField("email", value)} type="email" autoComplete="email" />
                  <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3">
                    <TextField icon={<Phone size={18} />} label="Code" value={form.countryCode} onChange={(value) => setField("countryCode", value)} autoComplete="tel-country-code" inputMode="tel" placeholder="+91" />
                    <TextField icon={<Phone size={18} />} label="Phone number" value={form.phone} onChange={(value) => setField("phone", value)} autoComplete="tel-national" inputMode="tel" />
                  </div>
                </div>
                <PremiumNote>Demo requests and coach applications are reviewed with the same contact record, so the academy team can follow up cleanly.</PremiumNote>
              </div>
            )}

            {activeStep.id === "profile" && (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField icon={<MapPin size={18} />} label="City" value={form.city} onChange={(value) => setField("city", value)} />
                  <SelectField label="Country" value={form.country} onChange={(value) => setField("country", value)}>
                    <option value="">Select country</option>
                    {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
                  </SelectField>
                </div>
                <SelectField label="Current chess level" value={form.level} onChange={(value) => setField("level", value)}>
                  <option value="">Select current level</option>
                  <option value="absolute_beginner">Absolute Beginner</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="federated">Federated Player</option>
                </SelectField>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Placement" value="Demo first" />
                  <MiniMetric label="Portal access" value="Instant" />
                  <MiniMetric label="Review" value="Admin tracked" />
                </div>
              </div>
            )}

            {activeStep.id === "coachProfile" && (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField icon={<MapPin size={18} />} label="City" value={form.city} onChange={(value) => setField("city", value)} />
                  <SelectField label="Country" value={form.country} onChange={(value) => setField("country", value)}>
                    <option value="">Select country</option>
                    {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
                  </SelectField>
                  <TextField icon={<Trophy size={18} />} label="Playing or coaching level" value={form.playingLevel} onChange={(value) => setField("playingLevel", value)} />
                  <TextField icon={<ShieldCheck size={18} />} label="FIDE ID" value={form.fideId} onChange={(value) => setField("fideId", value)} />
                  <TextField icon={<Target size={18} />} label="Rating" value={form.rating} onChange={(value) => setField("rating", value)} type="number" />
                </div>
                <PremiumNote>Applications are saved for admin review before teaching access is activated.</PremiumNote>
              </div>
            )}

            {activeStep.id === "teaching" && (
              <div className="mt-5 grid gap-4">
                <TextareaField label="Coaching experience and certifications" value={form.coachExperience} onChange={(value) => setField("coachExperience", value)} rows={4} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextareaField label="Preferred student levels or age groups" value={form.preferredStudents} onChange={(value) => setField("preferredStudents", value)} rows={3} />
                  <TextareaField label="General availability" value={form.availabilityNote} onChange={(value) => setField("availabilityNote", value)} rows={3} />
                </div>
                <TextareaField label="Message for admin" value={form.message} onChange={(value) => setField("message", value)} rows={3} />
              </div>
            )}

            {activeStep.id === "security" && (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordField label="Password" value={form.password} onChange={(value) => setField("password", value)} show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
                  <PasswordField label="Confirm password" value={form.confirmPassword} onChange={(value) => setField("confirmPassword", value)} show={showPassword} />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-black text-slate-700">Password strength</span>
                    <span className="font-bold text-slate-500">{["Too short", "Basic", "Good", "Strong", "Excellent"][passwordScore]}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span key={index} className={`h-2 rounded-full ${index < passwordScore ? "bg-brand" : "bg-slate-200"}`} />
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2">
                    <span className={form.password.length >= 8 ? "text-emerald-700" : ""}>Minimum 8 characters</span>
                    <span className={/[0-9]|[^A-Za-z0-9]/.test(form.password) ? "text-emerald-700" : ""}>Number or symbol recommended</span>
                  </div>
                </div>
              </div>
            )}

            {activeStep.id === "consent" && (
              <div className="mt-5 grid gap-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-black text-slate-900">Review before submission</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ReviewItem label={role === "student" ? "Student" : "Applicant"} value={form.name || "Not added"} />
                    {role === "student" && <ReviewItem label="Parent" value={form.parentName || "Not added"} />}
                    <ReviewItem label="Email" value={form.email || "Not added"} />
                    <ReviewItem label="Phone" value={`${form.countryCode} ${form.phone}`.trim()} />
                    <ReviewItem label="Location" value={[form.city, form.country].filter(Boolean).join(", ") || "Not added"} />
                    <ReviewItem label={role === "student" ? "Level" : "Profile"} value={role === "student" ? form.level || "Not selected" : form.playingLevel || "Not added"} />
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                  <PolicyCheck checked={form.acceptedPrivacy} onChange={(value) => setField("acceptedPrivacy", value)} label="I accept the Privacy Policy" href="https://www.envisionchessacademy.com/privacy-policy" />
                  <PolicyCheck checked={form.acceptedTerms} onChange={(value) => setField("acceptedTerms", value)} label="I accept the Terms and Conditions" href="https://www.envisionchessacademy.com/terms-and-conditions" />
                  <PolicyCheck checked={form.acceptedRefund} onChange={(value) => setField("acceptedRefund", value)} label="I accept the Refund Policy" href="https://www.envisionchessacademy.com/refund-policy" />
                  {role === "student" && <PlainCheck checked={form.parentConsent} onChange={(value) => setField("parentConsent", value)} label="Parent or guardian consent is confirmed." />}
                  <PlainCheck checked={form.academyUpdates} onChange={(value) => setField("academyUpdates", value)} label="Receive academy updates and event announcements." />
                </div>
              </div>
            )}
          </section>

          <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
            <button type="button" onClick={goBack} disabled={stepIndex === 0 || loading} className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-200 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowLeft size={17} /> Back
            </button>
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={goNext} className="btn-primary h-12 px-6">
                Continue <ArrowRight size={17} />
              </button>
            ) : (
              <button className="btn-primary h-12 px-6" disabled={loading}>
                {loading ? "Submitting..." : role === "student" ? "Create Demo Account" : "Submit Application"} <ArrowRight size={17} />
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

function StepHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand">
        <Icon size={21} />
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        <p className="text-sm font-semibold text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function TextField({
  icon,
  label,
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-lg border border-brand/15 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
        {icon}
        <input className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400" value={value} onChange={(event) => onChange(event.target.value)} {...props} />
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-lg border border-brand/15 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" {...props}>
        {children}
      </select>
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="w-full resize-none rounded-lg border border-brand/15 bg-white px-3 py-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" {...props} />
    </label>
  );
}

function PasswordField({
  label,
  show,
  onToggle,
  value,
  onChange,
}: {
  label: string;
  show: boolean;
  onToggle?: () => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-lg border border-brand/15 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
        <ShieldCheck size={18} />
        <input
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none"
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
        />
        {onToggle && (
          <button type="button" onClick={onToggle} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
    </label>
  );
}

function PolicyCheck({ checked, onChange, label, href }: { checked: boolean; onChange: (checked: boolean) => void; label: string; href: string }) {
  return (
    <label className="flex items-start gap-3 text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      <span>{label} <Link href={href} target="_blank" className="font-black text-brand underline">View</Link></span>
    </label>
  );
}

function PlainCheck({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      <span>{label}</span>
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <span className="block text-xs font-black uppercase text-brand">{label}</span>
      <span className="mt-1 block text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <span className="block text-[11px] font-black uppercase text-slate-500">{label}</span>
      <span className="mt-1 block truncate text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function PremiumNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-brand/15 bg-brand-50 p-4 text-sm font-semibold leading-6 text-brand">
      {children}
    </div>
  );
}
