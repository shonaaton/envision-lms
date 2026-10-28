import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { monthReport, pendingByStudent } from "@/lib/branch/service";
import { monthKey, monthLabel } from "@/lib/branch/rules";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { paid: "Paid", partial: "Part paid", unpaid: "Pending", waived: "Waived" };

/** The month's fee sheet plus every family still owing, as one workbook. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    const url = new URL(req.url);
    const month = url.searchParams.get("month") || monthKey();
    const format = resolveFormat(url.searchParams.get("format"), "xlsx");
    const [report, pending] = await Promise.all([monthReport(access.branch, month), pendingByStudent(access.branch)]);
    const body = buildSpreadsheet(format, [
      {
        name: monthLabel(month),
        columns: [
          { label: "Student" },
          { label: "Parent" },
          { label: "Phone" },
          { label: "Slots" },
          { label: "Fee", type: "money" },
          { label: "Discount", type: "money" },
          { label: "Late fee", type: "money" },
          { label: "Paid", type: "money" },
          { label: "Balance", type: "money" },
          { label: "Status", type: "badge" },
          { label: "Paid on", type: "date" },
          { label: "Mode" },
        ],
        rows: report.bills.map((bill) => {
          const last = bill.payments[bill.payments.length - 1];
          return [
            bill.student?.name || "",
            bill.student?.parentName || "",
            bill.student?.phone || "",
            (bill.student?.slots || []).map((slot: { label: string }) => slot.label).join(", "),
            bill.amount,
            bill.discount,
            bill.lateFee,
            bill.paidAmount,
            bill.balance,
            STATUS_LABELS[bill.status] || bill.status,
            last ? new Date(last.paidAt) : null,
            [...new Set(bill.payments.map((payment: { mode: string }) => payment.mode.toUpperCase()))].join(", "),
          ];
        }),
      },
      {
        name: "Pending (all months)",
        columns: [
          { label: "Student" },
          { label: "Parent" },
          { label: "Phone" },
          { label: "Status" },
          { label: "Months pending" },
          { label: "Months", type: "number" },
          { label: "Total pending", type: "money" },
        ],
        rows: pending.map((group) => [
          group.student?.name || "",
          group.student?.parentName || "",
          group.student?.phone || "",
          group.student?.status === "active" ? "Active" : "Inactive",
          group.bills.map((bill) => monthLabel(bill.month)).join(", "),
          group.bills.length,
          group.balance,
        ]),
      },
    ]);
    return new Response(new Uint8Array(body), { headers: spreadsheetHeaders(format, `bowbazar-fees-${month}`, body) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
