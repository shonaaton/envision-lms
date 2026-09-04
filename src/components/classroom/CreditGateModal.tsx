"use client";

import Link from "next/link";
import { AlertTriangle, WalletCards } from "lucide-react";

export type CreditGateKind = "final_class" | "blocked";

const RECHARGE_HREF = "/fees/invoices";

/**
 * Centered warning shown when a credit-plan student is on their final grace
 * class (`final_class`) or has run out entirely (`blocked`).
 *
 * Only `final_class` gets a confirm action, and the caller passes the real
 * classroom-launch function into `onConfirm` so the launch happens directly
 * inside this button's own click gesture (no popup blocking, no duplicated
 * join implementation).
 */
export default function CreditGateModal({
  kind,
  onClose,
  onConfirm,
  confirmLabel = "Continue to Class",
}: {
  kind: CreditGateKind;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const blocked = kind === "blocked";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-gate-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${blocked ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
            {blocked ? <WalletCards size={19} /> : <AlertTriangle size={19} />}
          </span>
          <div className="min-w-0">
            <h2 id="credit-gate-title" className="text-lg font-black text-slate-950">
              {blocked ? "Classroom Access Paused" : "Last Class Available"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {blocked
                ? "Your class credits have been exhausted, including your final class allowance. Please recharge your credits to continue attending classes."
                : "You have exhausted your available class credits. You can still attend this class as your final class, but please recharge your credits immediately. After this class, you will be unable to join another classroom until your credits are recharged."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <button type="button" className="btn-outline" onClick={onClose}>
            {blocked ? "Close" : "Not now"}
          </button>
          <Link href={RECHARGE_HREF} className={blocked ? "btn-primary" : "btn-outline"}>
            <WalletCards size={16} />
            Recharge Credits
          </Link>
          {!blocked && onConfirm ? (
            <button type="button" className="btn-primary" onClick={onConfirm}>
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
