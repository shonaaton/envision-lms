"use server";

import { revalidatePath } from "next/cache";

import { resolveStaffInvoiceViewer } from "@/lib/staffInvoiceAccess";
import { StaffInvoiceError, generateStaffInvoice, savePayoutProfile, setInvoicePaid, type GenerateInvoiceInput } from "@/lib/staffInvoiceData";

export type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof StaffInvoiceError) return { ok: false, error: error.message };
  console.error("[staff-invoices]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** The person's own invoice details. Always their own: the subject comes from the session. */
export async function saveInvoiceDetails(formData: FormData): Promise<ActionResult> {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer?.canCreate) return { ok: false, error: "You do not have access to staff invoices." };
  try {
    const field = (key: string) => String(formData.get(key) || "");
    await savePayoutProfile(
      viewer.userId,
      {
        fullName: field("fullName"),
        address: field("address"),
        pan: field("pan"),
        nextInvoiceNumber: field("nextInvoiceNumber"),
        bankName: field("bankName"),
        accountNumber: field("accountNumber"),
        branchName: field("branchName"),
        ifsc: field("ifsc"),
        accountType: field("accountType"),
      },
      field("signature")
    );
    revalidatePath("/staff-invoices");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function generateInvoice(input: GenerateInvoiceInput): Promise<ActionResult<{ id: string; fileName: string; subject: string; total: number }>> {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer?.canCreate) return { ok: false, error: "You do not have access to staff invoices." };
  try {
    const result = await generateStaffInvoice(viewer.userId, input);
    revalidatePath("/staff-invoices");
    revalidatePath("/staff-invoices/register");
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}

export async function markInvoicePaid(formData: FormData) {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer?.canManage) throw new Error("Forbidden");
  await setInvoicePaid({
    invoiceId: String(formData.get("id") || ""),
    actorId: viewer.userId,
    paid: String(formData.get("decision") || "paid") === "paid",
    reference: String(formData.get("reference") || ""),
    paidOn: String(formData.get("paidOn") || ""),
  });
  revalidatePath("/staff-invoices/register");
  revalidatePath("/staff-invoices");
}
