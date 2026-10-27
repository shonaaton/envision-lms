import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSalesViewer } from "@/lib/salesAudit";
import { PaymentLinkError, type PaymentLinkActor } from "@/lib/payments/salesPaymentLinks";

export const PAYMENT_LINK_PERMISSIONS = ["view", "create", "cancel", "attach"] as const;

/** The viewer with their grants; anyone who can attach payments sees every link. */
export async function paymentLinkViewer() {
  const viewer = await requireSalesViewer("salesPaymentLinks", PAYMENT_LINK_PERMISSIONS);
  if (!viewer) return null;
  const actor: PaymentLinkActor = { id: viewer.id, name: viewer.name, seesAll: Boolean(viewer.permissions.attach) };
  return { viewer, actor };
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function errorResponse(error: unknown) {
  if (error instanceof PaymentLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Check the form and try again." }, { status: 400 });
  console.error("Payment links request failed", error);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
