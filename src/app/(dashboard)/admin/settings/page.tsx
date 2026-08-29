import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { ACADEMY_DEFAULTS, ACADEMY_FAVICON_URL, ACADEMY_LOGO_URL, ACADEMY_SIGNATURE_URL } from "@/lib/branding";
import { AcademySettings } from "@/models/Fee";
import { recordActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Image as ImageIcon, Save, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

async function saveAcademySetup(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  try {
    await dbConnect();
    const settings = await AcademySettings.findOneAndUpdate(
      {},
      {
        academyName: String(formData.get("academyName") || "").trim(),
        registeredAddress: String(formData.get("registeredAddress") || "").trim(),
        gstNumber: String(formData.get("gstNumber") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        authorizedSignatory: ACADEMY_DEFAULTS.authorizedSignatory,
        invoiceFooter: String(formData.get("invoiceFooter") || "").trim(),
        invoiceMode: formData.get("invoiceMode") === "gst" ? "gst" : "non_gst",
        gstPercentage: Number(formData.get("gstPercentage") || 0),
        invoicePrefix: String(formData.get("invoicePrefix") || "ENV").trim() || "ENV",
        lowCreditThreshold: Number(formData.get("lowCreditThreshold") || 1),
        logoUrl: ACADEMY_LOGO_URL,
        signatoryUrl: ACADEMY_SIGNATURE_URL,
        faviconUrl: ACADEMY_FAVICON_URL,
      },
      { upsert: true, new: true }
    );
    await recordActivity({
      actor: (session!.user as any).id,
      type: "academy.settings.updated",
      label: "Updated academy settings",
      entityType: "AcademySettings",
      entityId: settings._id.toString(),
      metadata: {
        fields: ["academyName", "registeredAddress", "gstNumber", "email", "phone", "invoiceFooter", "invoiceMode", "gstPercentage", "invoicePrefix", "lowCreditThreshold"],
        source: "manual_admin",
      },
    });
    revalidatePath("/admin/settings");
    revalidatePath("/fees");
    revalidatePath("/fees/invoices");
  } catch (error: any) {
    redirect(`/admin/settings?error=${encodeURIComponent(error?.message || "Could not save academy settings")}`);
  }
  redirect("/admin/settings?saved=1");
}

export default async function AcademySettingsPage({ searchParams }: { searchParams?: { saved?: string; error?: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const settings: any = await getAcademySettings();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Settings size={18} /></span>
        <div>
          <h1 className="text-2xl font-semibold">Academy Setup</h1>
          <p className="text-sm text-slate-500">Branding, invoice identity, GST settings, and document assets.</p>
        </div>
      </div>

      {searchParams?.saved && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Academy settings saved successfully.
        </div>
      )}
      {searchParams?.error && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {searchParams.error}
        </div>
      )}

      <form action={saveAcademySetup} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input name="academyName" defaultValue={settings.academyName} className="rounded-md border px-3 py-2 text-sm" placeholder="Academy Name" />
          <input name="phone" defaultValue={settings.phone} className="rounded-md border px-3 py-2 text-sm" placeholder="Academy Phone Number" />
          <input name="email" defaultValue={settings.email} className="rounded-md border px-3 py-2 text-sm" placeholder="Academy Email Address" />
          <input name="gstNumber" defaultValue={settings.gstNumber} className="rounded-md border px-3 py-2 text-sm" placeholder="GST Number" />
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Authorised Signatory: <span className="font-semibold text-slate-950">{ACADEMY_DEFAULTS.authorizedSignatory}</span>
          </div>
          <input name="invoicePrefix" defaultValue={settings.invoicePrefix} className="rounded-md border px-3 py-2 text-sm" placeholder="Invoice Prefix, e.g. ENV" />
          <select name="invoiceMode" defaultValue={settings.invoiceMode} className="rounded-md border px-3 py-2 text-sm">
            <option value="gst">GST Invoice</option>
            <option value="non_gst">Non-GST Invoice</option>
          </select>
          <input name="gstPercentage" defaultValue={settings.gstPercentage} type="number" min="0" step="0.01" className="rounded-md border px-3 py-2 text-sm" placeholder="GST Percentage" />
          <input name="lowCreditThreshold" defaultValue={settings.lowCreditThreshold} type="number" min="0" className="rounded-md border px-3 py-2 text-sm" placeholder="Low Credit Alert Threshold" />
          <textarea name="registeredAddress" defaultValue={settings.registeredAddress} className="md:col-span-2 rounded-md border px-3 py-2 text-sm" placeholder="Registered Address" />
          <textarea name="invoiceFooter" defaultValue={settings.invoiceFooter} className="md:col-span-2 rounded-md border px-3 py-2 text-sm" placeholder="Invoice Footer Details" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["Academy Logo", "Locked to Cloudinary logo URL.", ACADEMY_LOGO_URL],
            ["Authorised Signatory", "Locked to Cloudinary signature URL.", ACADEMY_SIGNATURE_URL],
            ["Favicon", "Locked to the app favicon asset.", ACADEMY_FAVICON_URL],
          ].map(([label, help, current]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-medium"><ImageIcon size={16} /> {label}</div>
              <div className="mt-1 text-xs text-slate-500">{help}</div>
              <div className="mt-2 truncate text-xs text-purple-700">Cloudinary: {current}</div>
            </div>
          ))}
        </div>

        <button className="mt-5 inline-flex items-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800">
          <Save size={16} /> Save Academy Setup
        </button>
      </form>
    </div>
  );
}
