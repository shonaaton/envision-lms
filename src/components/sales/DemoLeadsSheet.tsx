"use client";

import { Fragment, useState } from "react";
import { MessageCircle, Trash2 } from "lucide-react";

/**
 * The Demo Leads CRM as a sheet: one lead per row, one detail per column.
 *
 * Everything shown is prepared on the server (labels, dates in IST), so this
 * component only lays it out and submits the page's server actions. Stage and
 * salesperson save as soon as a new value is picked.
 */

export type DemoLeadSheetRow = {
  id: string;
  name: string;
  /** "" on requests sent before the form asked for one (2026-11-12). */
  email: string;
  received: string;
  phoneLabel: string;
  telHref: string;
  whatsappHref: string;
  verification: "verified" | "failed" | "unverified";
  age: string;
  level: string;
  classPreference: string;
  callTime: string;
  demoSlot: string;
  stage: string;
  ownerId: string;
  ownerName: string;
  noteCount: number;
  log: Array<{ kind: string; text: string; byName: string; at: string }>;
};

type Action = (formData: FormData) => void | Promise<void>;

type Props = {
  rows: DemoLeadSheetRow[];
  stages: Array<{ value: string; label: string }>;
  owners: Array<{ id: string; name: string }>;
  canManage: boolean;
  seesAll: boolean;
  moveStage: Action;
  addNote: Action;
  changeOwner: Action;
  deleteLead: Action;
};

const STAGE_STYLES: Record<string, string> = {
  new: "bg-amber-100 text-amber-900",
  qualified: "bg-sky-100 text-sky-900",
  demo_taken: "bg-violet-100 text-violet-900",
  converted: "bg-emerald-100 text-emerald-900",
  lost: "bg-slate-200 text-slate-700",
};

const VERIFICATION: Record<DemoLeadSheetRow["verification"], { label: string; style: string }> = {
  verified: { label: "Verified", style: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Code not sent", style: "bg-rose-100 text-rose-800" },
  unverified: { label: "Not verified", style: "bg-rose-100 text-rose-800" },
};

const TH = "border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left text-[10px] font-black uppercase tracking-[0.04em] text-slate-600 last:border-r-0";
const TD = "break-words border-b border-r border-slate-200 px-2 py-2 align-middle last:border-r-0";

export function DemoLeadsSheet({ rows, stages, owners, canManage, seesAll, moveStage, addNote, changeOwner, deleteLead }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const columns = seesAll ? 12 : 10;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Fixed column shares and wrapping cells: every column, the delete button included, is on screen without scrolling sideways. */}
      <table className="w-full min-w-[860px] table-fixed border-collapse text-xs text-slate-800">
        <colgroup>
          <col style={{ width: "8%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "10%" }} />
          {seesAll ? <col style={{ width: "10%" }} /> : null}
          <col style={{ width: "5%" }} />
          {seesAll ? <col style={{ width: "3%" }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th className={TH}>Received</th>
            <th className={TH}>Parent</th>
            <th className={TH}>WhatsApp</th>
            <th className={TH}>Age</th>
            <th className={TH}>Level</th>
            <th className={TH}>Class</th>
            <th className={TH}>Time to call</th>
            <th className={TH}>Demo slot</th>
            <th className={TH}>Stage</th>
            {seesAll ? <th className={TH}>Salesperson</th> : null}
            <th className={TH}>Notes</th>
            {seesAll ? <th className={TH}><span className="sr-only">Delete</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const expanded = open === row.id;
            const verification = VERIFICATION[row.verification];
            return (
              <Fragment key={row.id}>
                <tr className={index % 2 ? "bg-slate-50/60" : "bg-white"}>
                  <td className={`${TD} text-[11px] text-slate-600`}>{row.received}</td>
                  <td className={TD}>
                    <span className="block font-bold text-slate-950">{row.name}</span>
                    {row.email ? (
                      <a href={`mailto:${row.email}`} className="block break-all text-[11px] font-semibold text-brand hover:underline">
                        {row.email}
                      </a>
                    ) : null}
                  </td>
                  <td className={TD}>
                    <a href={row.telHref} className="whitespace-nowrap font-bold text-brand hover:underline">{row.phoneLabel}</a>
                    {row.whatsappHref ? (
                      <a
                        href={row.whatsappHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp ${row.name}`}
                        title="Open WhatsApp chat"
                        className="ml-1 inline-flex align-middle text-emerald-700 hover:text-emerald-900"
                      >
                        <MessageCircle size={15} />
                      </a>
                    ) : null}
                    <span className={`mt-1 block w-fit rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] ${verification.style}`}>{verification.label}</span>
                  </td>
                  <td className={TD}>{row.age}</td>
                  <td className={TD}>{row.level}</td>
                  <td className={TD}>{row.classPreference}</td>
                  <td className={TD}>{row.callTime || <span className="text-slate-400">Not given</span>}</td>
                  <td className={TD}>{row.demoSlot || <span className="text-slate-400">Not chosen</span>}</td>
                  <td className={TD}>
                    {canManage ? (
                      <form action={moveStage}>
                        <input type="hidden" name="lead" value={row.id} />
                        <select
                          key={row.stage}
                          name="stage"
                          defaultValue={row.stage}
                          aria-label={`Stage for ${row.name}`}
                          onChange={(event) => event.currentTarget.form?.requestSubmit()}
                          className={`h-8 w-full cursor-pointer rounded-md border border-transparent px-1 text-xs font-black outline-none focus:border-brand ${STAGE_STYLES[row.stage] || ""}`}
                        >
                          {stages.map((stage) => (
                            <option key={stage.value} value={stage.value}>{stage.label}</option>
                          ))}
                        </select>
                      </form>
                    ) : (
                      <span className={`rounded-md px-2 py-1 text-xs font-black ${STAGE_STYLES[row.stage] || ""}`}>
                        {stages.find((stage) => stage.value === row.stage)?.label || row.stage}
                      </span>
                    )}
                  </td>
                  {seesAll ? (
                    <td className={TD}>
                      {owners.length ? (
                        <form action={changeOwner}>
                          <input type="hidden" name="lead" value={row.id} />
                          <select
                            key={row.ownerId}
                            name="owner"
                            defaultValue={row.ownerId}
                            aria-label={`Salesperson for ${row.name}`}
                            onChange={(event) => event.currentTarget.form?.requestSubmit()}
                            className="h-8 w-full cursor-pointer rounded-md border border-slate-200 bg-white px-1 text-xs font-bold text-slate-900 outline-none focus:border-brand"
                          >
                            {row.ownerId && !owners.some((owner) => owner.id === row.ownerId) ? <option value={row.ownerId}>{row.ownerName}</option> : null}
                            {!row.ownerId ? <option value="">Unassigned</option> : null}
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>{owner.name}</option>
                            ))}
                          </select>
                        </form>
                      ) : (
                        row.ownerName || <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                  ) : null}
                  <td className={TD}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : row.id)}
                      className="text-xs font-black text-brand hover:underline"
                    >
                      {expanded ? "Hide" : row.noteCount ? `Notes (${row.noteCount})` : "Add note"}
                    </button>
                  </td>
                  {seesAll ? (
                    <td className={`${TD} !px-0 text-center`}>
                      <form
                        action={deleteLead}
                        onSubmit={(event) => {
                          if (!window.confirm(`Delete the lead for ${row.name} (${row.phoneLabel})? Its notes and history go with it, and this cannot be undone.`)) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="lead" value={row.id} />
                        <button aria-label={`Delete the lead for ${row.name}`} title="Delete lead" className="rounded-md p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-800">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>

                {expanded ? (
                  <tr className="bg-slate-50">
                    <td colSpan={columns} className="whitespace-normal border-b border-slate-200 px-4 py-3">
                      <div className="max-w-3xl">
                        {row.log.length ? (
                          <ul className="space-y-2">
                            {row.log.map((entry, at) => (
                              <li key={at} className="text-sm leading-6">
                                <span className={entry.kind === "note" ? "whitespace-pre-line text-slate-900" : "font-semibold text-slate-500"}>{entry.text}</span>
                                <span className="block text-xs text-slate-500">{entry.byName || "System"} · {entry.at}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-500">Nothing logged yet.</p>
                        )}
                        {canManage ? (
                          <form action={addNote} className="mt-3 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="lead" value={row.id} />
                            <textarea
                              name="note"
                              required
                              maxLength={1000}
                              rows={2}
                              aria-label={`Note about ${row.name}`}
                              placeholder="What was said on the call, what happens next"
                              className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-brand"
                            />
                            <button className="btn-primary text-xs">Add note</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
