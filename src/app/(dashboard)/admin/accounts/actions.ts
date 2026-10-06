"use server";

import { revalidatePath } from "next/cache";

import { resolveAccountsViewer } from "@/lib/accounts/access";
import { cancelOpenInvoices, saveAccountsSettings } from "@/lib/accounts/cashData";
import { parseEntryAmount } from "@/lib/accounts/entryInput";
import { AccountsError, saveEntry, voidEntry, type EntryInput } from "@/lib/accounts/ledger";
import {
  acceptAllSuggestions,
  classifyTransaction,
  deleteRule,
  deleteStatement,
  refreshSuggestions,
  type Classification,
} from "@/lib/accounts/statementData";

export type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const FORBIDDEN = { ok: false as const, error: "Accounts is for admins only." };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof AccountsError) return { ok: false, error: error.message };
  console.error("[accounts]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

function refresh() {
  revalidatePath("/admin/accounts", "layout");
}

export async function saveEntryAction(input: EntryInput): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    await saveEntry({ ...input, source: undefined, bankTransaction: undefined, importBatch: undefined }, viewer.userId);
    await refreshSuggestions();
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function voidEntryAction(id: string): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    await voidEntry(id, viewer.userId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function classifyAction(id: string, decision: Classification): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    await classifyTransaction(id, decision, viewer.userId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptAllAction(importId: string): Promise<ActionResult<{ done: number }>> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    const done = await acceptAllSuggestions(importId, viewer.userId);
    refresh();
    return { ok: true, done };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteStatementAction(importId: string): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    await deleteStatement(importId, viewer.userId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteRuleAction(id: string): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    await deleteRule(id);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveCashSettingsAction(input: { openingCash: string; cashHolder: string }): Promise<ActionResult> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    const opening = input.openingCash.trim() ? parseEntryAmount(input.openingCash) : 0;
    if (opening === null) throw new AccountsError("Enter the opening cash as a number, e.g. 2500 or -1200.");
    await saveAccountsSettings({ openingCash: opening, cashHolder: input.cashHolder }, viewer.userId);
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelInvoicesAction(invoiceIds: string[], reason: string): Promise<ActionResult<{ cancelled: number }>> {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return FORBIDDEN;
  try {
    const cancelled = await cancelOpenInvoices(invoiceIds, reason, viewer.userId);
    refresh();
    revalidatePath("/fees/invoices");
    return { ok: true, cancelled };
  } catch (error) {
    return failure(error);
  }
}
