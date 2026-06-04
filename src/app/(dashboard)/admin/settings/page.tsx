import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { AcademySettings } from "@/models/Fee";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Image as ImageIcon, Save, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

const uploadRules = {
  logo: { max: 500 * 1024, types: ["image/png", "image/svg+xml"], folder: "logo" },
  signatory: { max: 300 * 1024, types: ["image/png"], folder: "signatory" },
  favicon: { max: 100 * 1024, types: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"], folder: "favicon" },
};

async function saveUpload(file: File | null, kind: keyof typeof uploadRules) {
  if (!file || file.size === 0) return "";
  const rule = uploadRules[kind];
  if (!rule.types.includes(file.type)) throw new Error(`${kind} file type is not supported.`);
  if (file.size > rule.max) throw new Error(`${kind} file is too large.`);
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const fileName = `${kind}-${Date.now()}.${extension}`;
  const dir = path.join(process.cwd(), "public", "uploads", "branding", rule.folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/branding/${rule.folder}/${fileName}`;
}

async function saveAcademySetup(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const existing: any = await getAcademySettings();
  const logoUrl = await saveUpload(formData.get("logo") as File | null, "logo");
  const signatoryUrl = await saveUpload(formData.get("signatory") as File | null, "signatory");
  const faviconUrl = await saveUpload(formData.get("favicon") as File | null, "favicon");

  await AcademySettings.findOneAndUpdate(
    {},
    {
      academyName: formData.get("academyName"),
      registeredAddress: formData.get("registeredAddress"),
      gstNumber: formData.get("gstNumber"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      authorizedSignatory: formData.get("authorizedSignatory"),
      invoiceFooter: formData.get("invoiceFooter"),
      invoiceMode: formData.get("invoiceMode"),
      gstPercentage: Number(formData.get("gstPercentage") || 0),
      invoicePrefix: formData.get("invoicePrefix") || "ENV",
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
}

export default async function AcademySettingsPage() {
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
            ["logo", "Academy Logo", "PNG/SVG, max 500 KB. Recommended 400x400 or 600x200.", settings.logoUrl],
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
