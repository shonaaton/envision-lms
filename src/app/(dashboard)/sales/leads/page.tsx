import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Handshake, Search } from "lucide-react";
import { DemoLeadsSheet, type DemoLeadSheetRow } from "@/components/sales/DemoLeadsSheet";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import { contactDisplayPhone, contactInterestLabel, whatsappDigits } from "@/lib/contactEnquiries";
import {
  addDemoLeadNote,
  deleteDemoLead,
  demoLeadViewer,
  demoLeadsHref,
  getDemoLeads,
  parseDemoLeadFilters,
  reassignDemoLead,
  setDemoLeadStage,
} from "@/lib/demoLeadCrm";
import { DEMO_LEAD_STAGES, demoAgeGroupLabel, demoChildLevelLabel, demoLeadStageLabel } from "@/lib/demoRequest";
import { logSalesAction, logSalesView, requireSalesViewer } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

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

async function deleteLead(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.lead.seesAll) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  const deleted = await deleteDemoLead(viewer.lead, lead);
  if (deleted) {
    logSalesAction(viewer.sales, `${viewer.sales.name} deleted the demo lead for ${deleted.name || "a parent"}`, { lead, ...deleted });
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

  // Labels and IST dates are made here, on the server, so the sheet has nothing to format.
  const sheetRows: DemoLeadSheetRow[] = data.rows.map((row) => {
    const wa = whatsappDigits(row.countryCode, row.phone);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      received: when(row.createdAt),
      phoneLabel: contactDisplayPhone(row.countryCode, row.phone),
      telHref: `tel:${wa ? `+${wa}` : row.phone}`,
      whatsappHref: wa ? `https://wa.me/${wa}` : "",
      verification: row.whatsappVerified ? "verified" : row.otpFailed ? "failed" : "unverified",
      age: demoAgeGroupLabel(row.ageGroup),
      level: demoChildLevelLabel(row.childLevel),
      classPreference: contactInterestLabel(row.interest),
      callTime: row.preferredTime,
      demoSlot: row.demoSlot,
      stage: row.stage,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      noteCount: row.log.filter((entry) => entry.kind === "note").length,
      log: row.log.map((entry) => ({ ...entry, at: when(entry.at) })),
    };
  });

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
                  placeholder="Parent's name, number or email"
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
          {sheetRows.length ? (
            <DemoLeadsSheet
              rows={sheetRows}
              stages={DEMO_LEAD_STAGES.map((stage) => ({ value: stage.value, label: stage.label }))}
              owners={data.owners}
              canManage={viewer.canManage}
              seesAll={seesAll}
              moveStage={moveStage}
              addNote={addNote}
              changeOwner={changeOwner}
              deleteLead={deleteLead}
            />
          ) : null}

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
