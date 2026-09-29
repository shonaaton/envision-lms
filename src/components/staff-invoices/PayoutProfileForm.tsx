"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, PenLine, Save, Upload, UserRound } from "lucide-react";

import { saveInvoiceDetails } from "@/app/(dashboard)/staff-invoices/actions";

export type PayoutProfileFormValues = {
  fullName: string;
  address: string;
  pan: string;
  bankName: string;
  accountNumber: string;
  branchName: string;
  ifsc: string;
  accountType: "savings" | "current";
  nextInvoiceNumber: string;
  signature: string;
};

const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be opened as an image."));
    };
    image.src = url;
  });
}

/**
 * Redraws the uploaded picture as a small RGBA PNG - the one format the
 * invoice's PDF writer embeds reliably, whatever the phone camera produced.
 * Optionally turns the near-white paper around the ink transparent, so the
 * signature sits cleanly on the invoice.
 */
async function normaliseSignature(file: File, removeBackground: boolean) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_WIDTH / image.naturalWidth, MAX_HEIGHT / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not process that image.");
  context.drawImage(image, 0, 0, width, height);
  if (removeBackground) {
    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (brightness > 215) {
        // Uniform transparent white compresses far better than paper grain.
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL("image/png");
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-700">
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export function PayoutProfileForm({
  initial,
  isFirstTime,
  cancelHref,
}: {
  initial: PayoutProfileFormValues | null;
  isFirstTime: boolean;
  cancelHref?: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [signature, setSignature] = useState(initial?.signature || "");
  const [newSignature, setNewSignature] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [pending, startTransition] = useTransition();

  async function applyFile(file: File | null, clearBackground: boolean) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error("Upload a JPG or PNG picture of your signature.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("That picture is larger than 8 MB.");
      return;
    }
    try {
      const png = await normaliseSignature(file, clearBackground);
      setNewSignature(png);
      setSignature(png);
      setLastFile(file);
    } catch (error: any) {
      toast.error(error?.message || "That image could not be used.");
    }
  }

  function submit(formData: FormData) {
    if (!signature) {
      toast.error("Upload your signature - it is printed on every invoice.");
      return;
    }
    formData.set("signature", newSignature);
    startTransition(async () => {
      const result = await saveInvoiceDetails(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invoice details saved");
      router.push("/staff-invoices");
      router.refresh();
    });
  }

  return (
    <form action={submit} className="grid gap-4">
      {isFirstTime && (
        <div className="rounded-lg border border-brand/20 bg-brand/[0.04] p-3 text-sm leading-6 text-slate-700">
          Before your first invoice, add the details that print on it. You only do this once - every later invoice reuses them,
          and you can change them any time with <span className="font-semibold">Edit my details</span>.
        </div>
      )}

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <UserRound size={16} /> Bill from
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" hint="As on your bank account. The invoice file is named after it.">
            <input name="fullName" required defaultValue={initial?.fullName} className="input h-10" autoComplete="name" />
          </Field>
          <Field label="PAN number">
            <input name="pan" required defaultValue={initial?.pan} className="input h-10 uppercase" maxLength={10} placeholder="ABCDE1234F" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <textarea name="address" required defaultValue={initial?.address} rows={3} className="input min-h-[84px] py-2" autoComplete="street-address" />
            </Field>
          </div>
          <Field
            label={isFirstTime ? "Invoice number for your first invoice" : "Next invoice number"}
            hint="Each new invoice suggests the next number (e.g. INV-001, then INV-002). You can still change it on the invoice."
          >
            <input name="nextInvoiceNumber" required defaultValue={initial?.nextInvoiceNumber} className="input h-10" placeholder="INV-001" />
          </Field>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <Landmark size={16} /> Bank account for payment
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank name">
            <input name="bankName" required defaultValue={initial?.bankName} className="input h-10" />
          </Field>
          <Field label="Branch name">
            <input name="branchName" required defaultValue={initial?.branchName} className="input h-10" />
          </Field>
          <Field label="Account number">
            <input name="accountNumber" required defaultValue={initial?.accountNumber} className="input h-10" inputMode="numeric" />
          </Field>
          <Field label="IFSC code">
            <input name="ifsc" required defaultValue={initial?.ifsc} className="input h-10 uppercase" maxLength={11} placeholder="SBIN0001234" />
          </Field>
          <Field label="Account type">
            <select name="accountType" defaultValue={initial?.accountType || "savings"} className="input h-10">
              <option value="savings">Savings</option>
              <option value="current">Current</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <PenLine size={16} /> Signature
        </h2>
        <p className="text-xs leading-5 text-slate-600">
          Sign on plain white paper, take a clear photo, and upload it. It is printed at the bottom of each invoice.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%),linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]">
            {signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature} alt="Your signature" className="max-h-20 max-w-[17rem] object-contain" />
            ) : (
              <span className="text-xs text-slate-400">No signature yet</span>
            )}
          </div>
          <div className="grid gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => applyFile(event.target.files?.[0] || null, removeBackground)}
            />
            <button type="button" className="btn-outline h-9 px-4 text-xs" onClick={() => fileInput.current?.click()}>
              <Upload size={14} /> {signature ? "Replace signature" : "Upload signature"}
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(event) => {
                  setRemoveBackground(event.target.checked);
                  void applyFile(lastFile, event.target.checked);
                }}
              />
              Remove the white paper background
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-primary h-10 px-5 text-sm">
          <Save size={15} /> {pending ? "Saving..." : isFirstTime ? "Save and continue" : "Save details"}
        </button>
        {cancelHref && (
          <a href={cancelHref} className="btn-ghost h-10 px-4 text-sm">
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
