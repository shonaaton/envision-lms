import { NextResponse } from "next/server";

import { resolveAccountsViewer } from "@/lib/accounts/access";
import { AccountsError } from "@/lib/accounts/ledger";
import { commitLedgerImport, previewLedgerImport } from "@/lib/accounts/ledgerImport";
import { importStatement, refreshSuggestions } from "@/lib/accounts/statementData";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const MAX_UPLOAD = 8 * 1024 * 1024;

/**
 * File uploads for Accounts: a bank statement, or a costs / offline income
 * sheet (preview, then commit). A route rather than a server action because
 * server actions stop at 1 MB and a year of bank statement does not.
 */
export async function POST(req: Request) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Accounts is for admins only." }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new AccountsError("Choose a file to upload.");
    if (file.size > MAX_UPLOAD) throw new AccountsError("That file is over 8 MB. Upload one quarter at a time.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name || "upload";
    const action = String(form.get("action") || "");
    const kind = form.get("kind") === "income" ? "income" : "expense";

    if (action === "statement") {
      const result = await importStatement({ buffer, fileName: name, accountLabel: String(form.get("accountLabel") || ""), actorId: viewer.userId });
      revalidatePath("/admin/accounts", "layout");
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "preview") {
      return NextResponse.json({ ok: true, rows: await previewLedgerImport(buffer, name, kind) });
    }
    if (action === "commit") {
      const result = await commitLedgerImport(buffer, name, kind, viewer.userId);
      await refreshSuggestions();
      revalidatePath("/admin/accounts", "layout");
      return NextResponse.json({ ok: true, ...result });
    }
    throw new AccountsError("Unknown upload.");
  } catch (error) {
    if (error instanceof AccountsError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    console.error("[accounts upload]", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
