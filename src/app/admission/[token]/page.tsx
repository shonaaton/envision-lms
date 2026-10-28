import type { Metadata } from "next";
import Script from "next/script";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import AdmissionForm from "@/components/bowbazar/AdmissionForm";
import { publicAdmission } from "@/lib/branch/admissions";
import { getTurnstileSiteKey } from "@/lib/humanVerification";

export const dynamic = "force-dynamic";

// A private link to one family's form: never indexed, never shared onward.
export const metadata: Metadata = {
  title: "Admission form | Envision Chess Academy",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand">{icon}</div>
      <h1 className="text-xl font-black text-slate-950">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </div>
  );
}

export default async function AdmissionPage({ params }: { params: { token: string } }) {
  const admission = await publicAdmission(params.token);
  const siteKey = getTurnstileSiteKey();

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white px-4 py-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-widest text-brand">Envision Chess Academy</div>
          <div className="text-sm font-semibold text-slate-600">{admission ? `${admission.branchLabel} centre` : "Admissions"}</div>
        </div>

        {!admission ? (
          <Notice icon={<XCircle size={24} />} title="This link isn't valid">
            Please check you opened the whole link from the message, or ask the centre to send it again.
          </Notice>
        ) : admission.state === "expired" ? (
          <Notice icon={<Clock size={24} />} title="This link has expired">
            Please ask the centre to send you a new admission link.
          </Notice>
        ) : admission.state === "closed" ? (
          <Notice icon={<XCircle size={24} />} title="This form is closed">
            Please contact the centre if you still want to join.
          </Notice>
        ) : admission.state === "received" ? (
          <Notice icon={<CheckCircle2 size={24} />} title="Form received">
            Thank you. The centre has {admission.studentName ? `${admission.studentName}'s` : "your"} details and will be in touch with the login details.
          </Notice>
        ) : (
          <>
            {siteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
            <AdmissionForm token={params.token} prefill={admission.prefill} branchLabel={admission.branchLabel} turnstileSiteKey={siteKey} />
          </>
        )}
      </div>
    </div>
  );
}
