import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarCheck, CalendarClock, Crown, GraduationCap, Handshake, MessageCircle, Phone, Search, UserRound } from "lucide-react";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import { contactDisplayPhone, contactInterestLabel, whatsappDigits } from "@/lib/contactEnquiries";
import {
  addDemoLeadNote,
  demoLeadViewer,
  demoLeadsHref,
  getDemoLeads,
  parseDemoLeadFilters,
  reassignDemoLead,
  setDemoLeadStage,
} from "@/lib/demoLeadCrm";
import { DEMO_LEAD_STAGES, demoAgeGroupLabel, demoChildLevelLabel, demoLeadStageLabel, type DemoLeadStage } from "@/lib/demoRequest";
import { logSalesAction, logSalesView, requireSalesViewer } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

const STAGE_STYLES: Record<DemoLeadStage, string> = {
  new: "bg-amber-100 text-amber-800",
  qualified: "bg-sky-100 text-sky-800",
  demo_taken: "bg-violet-100 text-violet-800",
  converted: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-700",
};

/**
 * The Demo Leads CRM rides on the Contact Enquiries grant, which the sales role
 * already holds, so it needs no new tick in Feature Access. Who sees which lead
 * is decided in src/lib/demoLeadCrm.ts, not by the grant.
 */
async function crmViewer() {
  const viewer = await requireSalesViewer("contactEnquiries", ["view", "manage"]);
  if (!viewer) return null;
  return { sales: viewer, canManage: Boolean(viewer.permissions.manage), lead: await demoLeadViewer(viewer) };
}

async function moveStage(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  const stage = String(formData.get("stage") || "");
  if (await setDemoLeadStage(viewer.lead, lead, stage)) {
    logSalesAction(viewer.sales, `${viewer.sales.name} moved a demo lead to ${demoLeadStageLabel(stage)}`, { lead, stage });
  }
  revalidatePath("/sales/leads");
}

async function addNote(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  if (await addDemoLeadNote(viewer.lead, lead, String(formData.get("note") || ""))) {
    logSalesAction(viewer.sales, `${viewer.sales.name} added a note to a demo lead`, { lead });
  }
  revalidatePath("/sales/leads");
}

async function changeOwner(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.lead.seesAll) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  const owner = String(formData.get("owner") || "");
  if (await reassignDemoLead(viewer.lead, lead, owner)) {
    logSalesAction(viewer.sales, `${viewer.sales.name} reassigned a demo lead`, { lead, owner });
  }
  revalidatePath("/sales/leads");
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function DemoLeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const viewer = await crmViewer();
  if (!viewer) redirect("/dashboard");

  const filters = parseDemoLeadFilters(searchParams);
  const data = await getDemoLeads(viewer.lead, filters);
  logSalesView(viewer.sales, "contactEnquiries", { surface: "demoLeads", stage: filters.stage, results: data.rows.length });

  const { seesAll } = viewer.lead;
  const filtered = Boolean(filters.query) || filters.owner !== "all";

  return (
    <NoCopyShell viewer={viewer.sales.name}>
      <div className="space-y-5 p-2 text-slate-950">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Handshake size={14} /> Demo Leads CRM
          </div>
          <h1 className="mt-2 text-3xl font-black text-brand">Demo Leads</h1>
          <p className="mt-1 text-sm text-slate-600">
            {seesAll
              ? "Every lead from the free demo form, shared between the salespeople in turn."
              : "The free demo form leads assigned to you."}{" "}
            {data.stageCounts.new} new {data.stageCounts.new === 1 ? "lead" : "leads"} waiting for a first call.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <nav aria-label="Filter by stage" className="flex flex-wrap gap-2">
            {(["all", ...DEMO_LEAD_STAGES.map((stage) => stage.value)] as const).map((stage) => (
              <Link
                key={stage}
                href={demoLeadsHref(filters, { stage })}
                className={`rounded-full px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.1em] transition ${
                  filters.stage === stage ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {stage === "all" ? "All" : demoLeadStageLabel(stage)} ({data.stageCounts[stage]})
              </Link>
            ))}
          </nav>

          <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.1em] text-slate-500">Search</span>
              <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 focus-within:border-brand">
                <Search size={16} />
                <input
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Parent's name or number"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none"
                />
              </span>
            </label>
            {seesAll ? (
              <label className="min-w-[12rem]">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.1em] text-slate-500">Salesperson</span>
                <select
                  name="owner"
                  defaultValue={filters.owner}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
                >
                  <option value="all">Everyone</option>
                  {data.owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                  ))}
                  <option value="none">Unassigned</option>
                </select>
              </label>
            ) : null}
            {filters.stage !== "all" ? <input type="hidden" name="stage" value={filters.stage} /> : null}
            <button type="submit" className="btn-primary h-11">Apply</button>
            {filtered ? (
              <Link href={demoLeadsHref(filters, { query: "", owner: "all" })} className="btn-outline h-11">Clear</Link>
            ) : null}
          </form>
        </section>

        {seesAll && data.owners.length < 2 ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {data.owners.length === 0
              ? "No staff account matches the lead rotation, so new leads are arriving unassigned."
              : `Only ${data.owners[0].name} matches the lead rotation, so every new lead is going to them.`}{" "}
            The rotation looks for active staff accounts named Mohammed and Sayandeb.
          </p>
        ) : null}

        <section className="space-y-3">
          {data.rows.map((row) => {
            const wa = whatsappDigits(row.countryCode, row.phone);
            const notes = row.log.filter((entry) => entry.kind === "note").length;
            return (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-slate-950">{row.name}</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] ${STAGE_STYLES[row.stage]}`}>
                        {demoLeadStageLabel(row.stage)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] ${
                          row.whatsappVerified ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {row.whatsappVerified ? "WhatsApp verified" : row.otpFailed ? "Code could not be sent" : "WhatsApp not verified"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {when(row.createdAt)}
                      {seesAll ? ` · ${row.ownerName ? `with ${row.ownerName}` : "unassigned"}` : null}
                    </p>
                  </div>

                  {viewer.canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {DEMO_LEAD_STAGES.filter((stage) => stage.value !== row.stage).map((stage) => (
                        <form key={stage.value} action={moveStage}>
                          <input type="hidden" name="lead" value={row.id} />
                          <input type="hidden" name="stage" value={stage.value} />
                          <button className="btn-outline text-xs">{stage.label}</button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail icon={Phone} label="WhatsApp">
                    <a href={`tel:${wa ? `+${wa}` : row.phone}`} className="font-bold text-brand hover:underline">
                      {contactDisplayPhone(row.countryCode, row.phone)}
                    </a>
                    {wa ? (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:underline"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    ) : null}
                  </Detail>
                  <Detail icon={UserRound} label="Child's age">
                    <span className="text-slate-700">{demoAgeGroupLabel(row.ageGroup)}</span>
                  </Detail>
                  <Detail icon={Crown} label="Student level">
                    <span className="text-slate-700">{demoChildLevelLabel(row.childLevel)}</span>
                  </Detail>
                  <Detail icon={GraduationCap} label="Class preference">
                    <span className="text-slate-700">{contactInterestLabel(row.interest)}</span>
                  </Detail>
                  <Detail icon={CalendarClock} label="Convenient time to call">
                    <span className="text-slate-700">{row.preferredTime || "Not given"}</span>
                  </Detail>
                  <Detail icon={CalendarCheck} label="Demo slot asked for">
                    <span className={row.demoSlot ? "font-bold text-slate-900" : "text-slate-500"}>{row.demoSlot || "Not chosen yet"}</span>
                  </Detail>
                </dl>

                <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-black text-slate-700">
                    Notes and history ({notes} {notes === 1 ? "note" : "notes"})
                  </summary>
                  {row.log.length ? (
                    <ul className="mt-3 space-y-2">
                      {row.log.map((entry, index) => (
                        <li key={index} className="text-sm leading-6">
                          <span className={entry.kind === "note" ? "whitespace-pre-line text-slate-900" : "font-semibold text-slate-500"}>{entry.text}</span>
                          <span className="block text-xs text-slate-500">
                            {entry.byName || "System"} · {when(entry.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Nothing logged yet.</p>
                  )}
                  {viewer.canManage ? (
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
                  {seesAll && data.owners.length ? (
                    <form action={changeOwner} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                      <input type="hidden" name="lead" value={row.id} />
                      <label className="text-xs font-black uppercase tracking-[0.1em] text-slate-500" htmlFor={`owner-${row.id}`}>
                        Salesperson
                      </label>
                      <select
                        id={`owner-${row.id}`}
                        name="owner"
                        defaultValue={row.ownerId}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-950 outline-none focus:border-brand"
                      >
                        {row.ownerId && !data.owners.some((owner) => owner.id === row.ownerId) ? <option value={row.ownerId}>{row.ownerName}</option> : null}
                        {!row.ownerId ? <option value="">Unassigned</option> : null}
                        {data.owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>{owner.name}</option>
                        ))}
                      </select>
                      <button className="btn-outline text-xs">Reassign</button>
                    </form>
                  ) : null}
                </details>
              </article>
            );
          })}

          {data.rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {filtered || filters.stage !== "all"
                ? "No leads match this filter."
                : seesAll
                  ? "No leads yet. Requests from the free demo form will appear here."
                  : "No leads are assigned to you yet. New ones appear here as they come in."}
            </div>
          ) : null}
          {data.total > data.rows.length ? (
            <p className="text-center text-xs font-semibold text-slate-500">
              Showing the newest {data.rows.length} of {data.total}. Use the stage tabs or search to narrow the list.
            </p>
          ) : null}
        </section>

        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}

function Detail({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm">{children}</dd>
      </div>
    </div>
  );
}
