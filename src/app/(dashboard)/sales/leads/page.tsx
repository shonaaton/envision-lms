import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AlarmClock, Handshake, Search } from "lucide-react";
import { AddDemoLeadForm, type AddLeadFormState } from "@/components/sales/AddDemoLeadForm";
import { DemoLeadsSheet, type DemoLeadSheetRow, type ReminderFormState } from "@/components/sales/DemoLeadsSheet";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import { academyDateKey, academyDateTime, academyDateTimeLocalInput, parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { contactDisplayPhone, contactInterestLabel, contactInterests, whatsappDigits } from "@/lib/contactEnquiries";
import { DIAL_CODES } from "@/lib/phoneCountryCodes";
import { demoLeadCallOutcomeLabel, reminderPresets } from "@/lib/demoLeadCalls";
import {
  addDemoLeadNote,
  addManualDemoLead,
  cancelDemoLeadReminder,
  deleteDemoLead,
  demoLeadViewer,
  demoLeadsHref,
  getDemoLeads,
  getMyDemoLeadReminders,
  logDemoLeadCall,
  parseDemoLeadFilters,
  reassignDemoLead,
  setDemoLeadReminder,
  setDemoLeadStage,
  updateDemoLeadDetails,
} from "@/lib/demoLeadCrm";
import {
  DEMO_AGE_GROUPS,
  DEMO_CHILD_LEVELS,
  DEMO_LEAD_STAGES,
  MANUAL_LEAD_SOURCES,
  demoAgeGroupLabel,
  demoChildLevelLabel,
  demoLeadStageLabel,
} from "@/lib/demoRequest";
import { LEAD_CHANNELS } from "@/lib/leadSource";
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

/** A lead typed in by hand. On success the page opens it; on a known number it names the existing lead. */
async function addLead(previous: AddLeadFormState, formData: FormData): Promise<AddLeadFormState> {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) return { error: "You do not have permission to add leads.", existingHref: "" };
  const text = (key: string) => String(formData.get(key) || "");
  const result = await addManualDemoLead(viewer.lead, {
    name: text("name"),
    countryCode: text("countryCode"),
    phone: text("phone"),
    email: text("email"),
    ageGroup: text("ageGroup"),
    childLevel: text("childLevel"),
    interest: text("interest"),
    preferredTime: text("preferredTime"),
    manualSource: text("manualSource"),
    note: text("note"),
    owner: text("owner"),
  });
  if (!result.ok) {
    const existingHref = result.existingId ? demoLeadsHref({ stage: "all", owner: "all", query: "", channel: "all", lead: result.existingId }) : "";
    return { error: result.error, existingHref };
  }
  logSalesAction(viewer.sales, `${viewer.sales.name} added a demo lead by hand`, { lead: result.id });
  revalidatePath("/sales/leads");
  redirect(demoLeadsHref({ stage: "all", owner: "all", query: "", channel: "all", lead: result.id }));
}

/** Edit details: corrections and missing information, checked and logged in updateDemoLeadDetails. */
async function editLead(previous: ReminderFormState, formData: FormData): Promise<ReminderFormState> {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) return { ...previous, error: "You do not have permission to edit leads." };
  const text = (key: string) => String(formData.get(key) || "");
  const lead = text("lead");
  const result = await updateDemoLeadDetails(viewer.lead, lead, {
    name: text("name"),
    email: text("email"),
    countryCode: text("countryCode"),
    phone: text("phone"),
    ageGroup: text("ageGroup"),
    childLevel: text("childLevel"),
    interest: text("interest"),
    preferredTime: text("preferredTime"),
    demoSlotDate: text("demoSlotDate"),
    demoSlotTime: text("demoSlotTime"),
    manualSource: text("manualSource"),
  });
  if (!result.ok) return { ...previous, error: result.error };
  if (result.changed) logSalesAction(viewer.sales, `${viewer.sales.name} edited a demo lead's details`, { lead, changed: result.changed });
  revalidatePath("/sales/leads");
  return { error: "", saved: previous.saved + 1 };
}

/** Picked up or Missed: the time is the server's clock when the button was pressed. */
async function logCall(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  const outcome = String(formData.get("outcome") || "");
  if (await logDemoLeadCall(viewer.lead, lead, outcome, String(formData.get("remarks") || ""), formData.get("remindAfterMissed"))) {
    logSalesAction(viewer.sales, `${viewer.sales.name} logged a ${demoLeadCallOutcomeLabel(outcome).toLowerCase()} call on a demo lead`, { lead, outcome });
  }
  revalidatePath("/sales/leads");
}

/** The time box is a datetime-local in academy (IST) wall-clock time, read back the same way. */
async function setReminder(previous: ReminderFormState, formData: FormData): Promise<ReminderFormState> {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) return { ...previous, error: "You do not have permission to set reminders." };
  const lead = String(formData.get("lead") || "");
  const raw = String(formData.get("dueAt") || "").trim();
  const dueAt = raw ? parseAcademyDateTimeLocal(raw) : null;
  const result = await setDemoLeadReminder(viewer.lead, lead, dueAt, String(formData.get("note") || ""));
  if (!result.ok) return { ...previous, error: result.error };
  logSalesAction(viewer.sales, `${viewer.sales.name} set a call reminder on a demo lead`, { lead, dueAt: dueAt?.toISOString() });
  revalidatePath("/sales/leads");
  return { error: "", saved: previous.saved + 1 };
}

async function cancelReminder(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer?.canManage) throw new Error("Forbidden");
  const reminder = String(formData.get("reminder") || "");
  if (await cancelDemoLeadReminder(viewer.lead, reminder)) {
    logSalesAction(viewer.sales, `${viewer.sales.name} removed a call reminder on a demo lead`, { reminder });
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

/** Admins delete any lead; a salesperson with manage access, only their own (checked in deleteDemoLead). */
async function deleteLead(formData: FormData) {
  "use server";
  const viewer = await crmViewer();
  if (!viewer || !(viewer.lead.seesAll || viewer.canManage)) throw new Error("Forbidden");
  const lead = String(formData.get("lead") || "");
  const deleted = await deleteDemoLead(viewer.lead, lead);
  if (deleted) {
    logSalesAction(viewer.sales, `${viewer.sales.name} deleted the demo lead for ${deleted.name || "a parent"}`, { lead, ...deleted });
  }
  revalidatePath("/sales/leads");
}

/** The choice lists shared by the Add lead form and each lead's Edit details form. */
const leadFormOptions = {
  dialCodes: DIAL_CODES.map((entry) => ({ value: entry.code, label: `+${entry.code}` })),
  ageGroups: DEMO_AGE_GROUPS.map((item) => ({ value: item.value, label: item.label })),
  childLevels: DEMO_CHILD_LEVELS.map((item) => ({ value: item.value, label: item.label })),
  interests: contactInterests.map((item) => ({ value: item.value, label: item.label })),
  sources: MANUAL_LEAD_SOURCES.map((item) => ({ value: item.value, label: item.label })),
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function DemoLeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const viewer = await crmViewer();
  if (!viewer) redirect("/dashboard");

  const filters = parseDemoLeadFilters(searchParams);
  const [data, myReminders] = await Promise.all([getDemoLeads(viewer.lead, filters), getMyDemoLeadReminders(viewer.lead)]);
  logSalesView(viewer.sales, "contactEnquiries", { surface: "demoLeads", stage: filters.stage, results: data.rows.length });

  const { seesAll } = viewer.lead;
  const filtered = Boolean(filters.query) || filters.owner !== "all" || filters.channel !== "all" || Boolean(filters.lead);

  // Reminder quick picks and the earliest time the box accepts, in IST like everything else here.
  const now = new Date();
  const presets = reminderPresets(now, academyDateTime, academyDateKey(now), academyDateKey(new Date(now.getTime() + 24 * 3600_000))).map((preset) => ({
    label: preset.label,
    value: academyDateTimeLocalInput(preset.at),
  }));

  // Labels and IST dates are made here, on the server, so the sheet has nothing to format.
  const sheetRows: DemoLeadSheetRow[] = data.rows.map((row) => {
    const wa = whatsappDigits(row.countryCode, row.phone);
    const calls = row.log.filter((entry) => entry.kind === "call");
    const lastCall = calls[calls.length - 1];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      source: row.source,
      received: when(row.createdAt),
      phoneLabel: contactDisplayPhone(row.countryCode, row.phone),
      telHref: `tel:${wa ? `+${wa}` : row.phone}`,
      whatsappHref: wa ? `https://wa.me/${wa}` : "",
      verification: row.manual ? "manual" : row.whatsappVerified ? "verified" : row.otpFailed ? "failed" : "unverified",
      age: demoAgeGroupLabel(row.ageGroup),
      level: demoChildLevelLabel(row.childLevel),
      classPreference: contactInterestLabel(row.interest),
      callTime: row.preferredTime,
      demoSlot: row.demoSlot,
      stage: row.stage,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      noteCount: row.log.filter((entry) => entry.kind === "note").length,
      callCount: calls.length,
      lastCall: lastCall ? { outcome: lastCall.outcome, label: demoLeadCallOutcomeLabel(lastCall.outcome), at: when(lastCall.at) } : null,
      reminders: row.reminders.map((reminder) => ({
        id: reminder.id,
        dueLabel: when(reminder.dueAt),
        note: reminder.note,
        status: reminder.status,
        forName: reminder.forName,
        mine: reminder.forId === viewer.lead.id,
        canCancel: viewer.canManage && (seesAll || reminder.forId === viewer.lead.id),
      })),
      // Newest first, so the latest call and its remarks are at the top.
      log: row.log.map((entry) => ({ ...entry, at: when(entry.at) })).reverse(),
      edit: {
        name: row.name,
        email: row.email,
        countryCode: row.countryCode.replace(/[^\d]/g, ""),
        phone: row.phone,
        ageGroup: row.ageGroup,
        childLevel: row.childLevel,
        interest: row.interest,
        preferredTime: row.preferredTime,
        demoSlotDate: row.demoSlotDate,
        demoSlotTime: row.demoSlotTime,
        manualSource: row.manualSource,
      },
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
              ? "Every lead from the free demo form or added by hand, shared between the salespeople in turn."
              : "The free demo form leads assigned to you, and the ones you added."}{" "}
            {data.stageCounts.new} new {data.stageCounts.new === 1 ? "lead" : "leads"} waiting for a first call.
          </p>
        </header>

        {viewer.canManage ? (
          <AddDemoLeadForm
            addLead={addLead}
            {...leadFormOptions}
            owners={seesAll ? data.owners.map((owner) => ({ value: owner.id, label: owner.name })) : []}
          />
        ) : null}

        {myReminders.length ? (
          <section aria-label="Your call-backs" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-800">
              <AlarmClock size={14} aria-hidden="true" /> Your call-backs
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {myReminders.map((reminder) => (
                <li key={reminder.id}>
                  <Link
                    href={demoLeadsHref({ stage: "all", owner: "all", query: "", channel: "all", lead: reminder.leadId })}
                    title={reminder.note || undefined}
                    className={`block rounded-lg border px-3 py-1.5 text-xs ${reminder.due ? "border-rose-300 bg-white text-rose-800" : "border-amber-200 bg-white text-slate-800"} hover:border-brand`}
                  >
                    <span className="font-black">{reminder.leadName}</span>
                    <span className="ml-1.5">{reminder.due ? `Due now (${when(reminder.dueAt)})` : when(reminder.dueAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <nav aria-label="Filter by stage" className="flex flex-wrap gap-2">
            {(["all", ...DEMO_LEAD_STAGES.map((stage) => stage.value)] as const).map((stage) => (
              <Link
                key={stage}
                href={demoLeadsHref(filters, { stage, lead: "" })}
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
                  placeholder="Name, number, email or campaign"
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
            <label className="min-w-[11rem]">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.1em] text-slate-500">Source</span>
              <select
                name="source"
                defaultValue={filters.channel}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
              >
                <option value="all">All sources</option>
                {LEAD_CHANNELS.map((channel) => (
                  <option key={channel.value} value={channel.value}>{channel.label}</option>
                ))}
              </select>
            </label>
            {filters.stage !== "all" ? <input type="hidden" name="stage" value={filters.stage} /> : null}
            <button type="submit" className="btn-primary h-11">Apply</button>
            {filtered ? (
              <Link href={demoLeadsHref(filters, { query: "", owner: "all", channel: "all", lead: "" })} className="btn-outline h-11">Clear</Link>
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
              canDelete={seesAll || viewer.canManage}
              moveStage={moveStage}
              addNote={addNote}
              changeOwner={changeOwner}
              deleteLead={deleteLead}
              logCall={logCall}
              setReminder={setReminder}
              cancelReminder={cancelReminder}
              reminderMin={academyDateTimeLocalInput(now)}
              reminderPresets={presets}
              editLead={editLead}
              editOptions={leadFormOptions}
              initialOpen={filters.lead || (sheetRows.length === 1 ? sheetRows[0].id : null)}
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
