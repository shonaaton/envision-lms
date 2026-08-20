import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { FeeAssignment, Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";

async function requireAdminLike() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return role === "admin" || role === "sub-admin" ? session : null;
}

function monthRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export async function GET() {
  const session = await requireAdminLike();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const now = new Date();
  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);
  const { from, to } = monthRange();
  const [invoices, lowCredit] = await Promise.all([
    Invoice.find({}).lean(),
    FeeAssignment.countDocuments({ type: "credits", creditBalance: { $lte: 1 } }),
  ]);
  const currentMonthPaid = invoices.filter((invoice: any) => invoice.status === "paid" && invoice.paidAt && new Date(invoice.paidAt) >= from && new Date(invoice.paidAt) <= to);
  const overdue = invoices.filter((invoice: any) => !["paid", "cancelled"].includes(invoice.status) && invoice.dueDate && new Date(invoice.dueDate) < now);
  const upcoming = invoices.filter((invoice: any) => !["paid", "cancelled"].includes(invoice.status) && invoice.dueDate && new Date(invoice.dueDate) >= now && new Date(invoice.dueDate) <= next7Days);
  return NextResponse.json({
    current_month_collection: currentMonthPaid.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0),
    overdue_totals: overdue.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0),
    upcoming_invoice_totals: upcoming.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0),
    active_low_credit_warnings: lowCredit,
  });
}

