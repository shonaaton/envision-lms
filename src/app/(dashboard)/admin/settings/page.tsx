import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { AcademySettings } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Image as ImageIcon, Save, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

const uploadRules = {
  logo: { max: 500 * 1024, types: ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"], folder: "logo" },
  signatory: { max: 300 * 1024, types: ["image/png"], folder: "signatory" },
  favicon: { max: 100 * 1024, types: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"], folder: "favicon" },
};

async function saveUpload(file: File | null, kind: keyof typeof uploadRules) {
  if (!file || file.size === 0) return "";
  const rule = uploadRules[kind];
  if (!rule.types.includes(file.type)) throw new Error(`${kind} file type is not supported.`);
  if (file.size > rule.max) throw new Error(`${kind} file is too large.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

async function saveAcademySetup(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  try {
    await dbConnect();
    const existing: any = await getAcademySettings();
    const logoUrl = await saveUpload(formData.get("logo") as File | null, "logo");
    const signatoryUrl = await saveUpload(formData.get("signatory") as File | null, "signatory");
    const faviconUrl = await saveUpload(formData.get("favicon") as File | null, "favicon");

    await AcademySettings.findOneAndUpdate(
      {},
      {
        academyName: String(formData.get("academyName") || "").trim(),
        registeredAddress: String(formData.get("registeredAddress") || "").trim(),
        gstNumber: String(formData.get("gstNumber") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        authorizedSignatory: String(formData.get("authorizedSignatory") || "").trim(),
        invoiceFooter: String(formData.get("invoiceFooter") || "").trim(),
        invoiceMode: formData.get("invoiceMode") === "gst" ? "gst" : "non_gst",
        gstPercentage: Number(formData.get("gstPercentage") || 0),
        invoicePrefix: String(formData.get("invoicePrefix") || "ENV").trim() || "ENV",
        lowCreditThreshold: Number(formData.get("lowCreditThreshold") || 3),
        logoUrl: logoUrl || existing.logoUrl,
        signatoryUrl: signatoryUrl || existing.signatoryUrl,
        faviconUrl: faviconUrl || existing.faviconUrl,
      },
      { upsert: true, new: true }
    );
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
          <input name="authorizedSignatory" defaultValue={settings.authorizedSignatory} className="rounded-md border px-3 py-2 text-sm" placeholder="Authorized Signatory Name" />
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
            ["logo", "Academy Logo", "PNG/JPG/SVG, max 500 KB. Recommended 600x220.", settings.logoUrl],
            ["signatory", "Authorized Signatory Upload", "PNG, max 300 KB. Recommended 400x150.", settings.signatoryUrl],
            ["favicon", "Favicon Upload", "PNG/ICO, max 100 KB. Recommended 512x512.", settings.faviconUrl],
          ].map(([name, label, help, current]) => (
            <label key={name} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-medium"><ImageIcon size={16} /> {label}</div>
              <div className="mt-1 text-xs text-slate-500">{help}</div>
              {current && <div className="mt-2 truncate text-xs text-purple-700">Current: {current}</div>}
              <input name={name} type="file" className="mt-3 w-full text-sm" />
            </label>
          ))}
        </div>

        <button className="mt-5 inline-flex items-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800">
          <Save size={16} /> Save Academy Setup
        </button>
      </form>
    </div>
  );
}
