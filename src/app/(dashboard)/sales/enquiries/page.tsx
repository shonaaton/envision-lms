import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronLeft, ChevronRight, Inbox, Mail, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  contactDisplayPhone,
  contactInterestLabel,
  contactInterests,
  whatsappDigits,
  type ContactStatus,
} from "@/lib/contactEnquiries";
import { enquiryHref, getEnquiryPage, parseEnquiryFilters } from "@/lib/contactEnquiryInbox";
import { logSalesAction, logSalesView, requireSalesViewer } from "@/lib/salesAudit";
import { ContactMessage } from "@/models/ContactMessage";
import { dbConnect } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<ContactStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-sky-100 text-sky-800",
  closed: "bg-slate-200 text-slate-700",
};

/**
 * Moves one enquiry between new, contacted and closed.
 *
 * The viewer's name is stamped onto the record rather than only into the audit
 * log, because the question the inbox has to answer at a glance is "is somebody
 * already calling this person" - and that has to survive without opening a
 * second screen.
 */
async function setEnquiryStatus(formData: FormData) {
  "use server";
  const viewer = await requireSalesViewer("contactEnquiries", ["view", "manage"]);
  if (!viewer?.permissions.manage) throw new Error("Forbidden");

  const id = String(formData.get("enquiry") || "");
  const status = String(formData.get("status") || "");
  if (!id || !(CONTACT_STATUSES as readonly string[]).includes(status)) return;

  await dbConnect();
  await ContactMessage.findByIdAndUpdate(id, {
    status,
    handledBy: viewer.id,
    handledByName: viewer.name,
    handledAt: new Date(),
  });
  logSalesAction(viewer, `${viewer.name} marked a contact enquiry as ${status}`, { enquiry: id, status });
  revalidatePath("/sales/enquiries");
}

export default async function ContactEnquiriesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const viewer = await requireSalesViewer("contactEnquiries", ["view", "manage"]);
  if (!viewer) redirect("/dashboard");

  const filters = parseEnquiryFilters(searchParams);
  const data = await getEnquiryPage(filters);
  logSalesView(viewer, "contactEnquiries", { page: data.page, status: filters.status, results: data.rows.length });

  const canManage = Boolean(viewer.permissions.manage);
  const firstOnPage = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastOnPage = Math.min(data.page * data.pageSize, data.total);

  return (
    <NoCopyShell viewer={viewer.name}>
      <div className="space-y-5 p-2 text-slate-950">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Inbox size={14} /> Contact Enquiries
          </div>
          <h1 className="mt-2 text-3xl font-black text-brand">Contact Enquiries</h1>
          <p className="mt-1 text-sm text-slate-600">
            Everything submitted through the public contact form, newest first. {data.statusCounts.new} waiting for a first reply.
          </p>
        </header>

        {/* ------------------------------------------------------- filters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {(["all", ...CONTACT_STATUSES] as const).map((status) => {
              const active = filters.status === status;
              return (
                <Link
                  key={status}
                  href={enquiryHref(filters, { status, page: 1 })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.1em] transition ${
                    active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status === "all" ? "All" : CONTACT_STATUS_LABELS[status]} ({data.statusCounts[status]})
                </Link>
              );
            })}
          </nav>

          {/* A GET form, so a filtered inbox is a shareable URL and the back
              button behaves the way a list page should. */}
          <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.1em] text-slate-500">Search</span>
              <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-500 focus-within:border-brand">
                <Search size={16} />
                <input
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Name, email, number, address or message"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none"
                />
              </span>
            </label>
            <label className="min-w-[12rem]">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.1em] text-slate-500">Interested in</span>
              <select
                name="interest"
                defaultValue={filters.interest}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-brand"
              >
                <option value="all">All options</option>
                {contactInterests.map((interest) => (
                  <option key={interest.value} value={interest.value}>{interest.label}</option>
                ))}
              </select>
            </label>
            {filters.status !== "all" ? <input type="hidden" name="status" value={filters.status} /> : null}
            <button type="submit" className="btn-primary h-11">Apply</button>
            {filters.query || filters.interest !== "all" ? (
              <Link href={enquiryHref(filters, { query: "", interest: "all", page: 1 })} className="btn-outline h-11">
                Clear
              </Link>
            ) : null}
          </form>
        </section>

        {/* -------------------------------------------------------- results */}
        <section className="space-y-3">
          {data.rows.map((row) => {
            const wa = whatsappDigits(row.countryCode, row.phone);
            return (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-slate-950">{row.name}</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] ${STATUS_STYLES[row.status]}`}>
                        {CONTACT_STATUS_LABELS[row.status]}
                      </span>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] text-brand">
                        {contactInterestLabel(row.interest)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      {row.handledByName ? ` · last updated by ${row.handledByName}` : null}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_STATUSES.filter((status) => status !== row.status).map((status) => (
                        <form key={status} action={setEnquiryStatus}>
                          <input type="hidden" name="enquiry" value={row.id} />
                          <input type="hidden" name="status" value={status} />
                          <button className="btn-outline text-xs">Mark {CONTACT_STATUS_LABELS[status].toLowerCase()}</button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail icon={Mail} label="Email">
                    <a href={`mailto:${row.email}`} className="break-all font-bold text-brand hover:underline">{row.email}</a>
                  </Detail>
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
                  <Detail icon={MapPin} label="Address">
                    <span className="text-slate-700">{row.address || "Not provided"}</span>
                  </Detail>
                </dl>

                {row.message ? (
                  <p className="mt-4 whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {row.message}
                  </p>
                ) : null}
              </article>
            );
          })}

          {data.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {data.statusCounts.all === 0
                ? "No contact enquiries yet. They appear here the moment somebody submits the form."
                : "No enquiries match these filters."}
            </div>
          ) : null}
        </section>

        {/* ----------------------------------------------------- pagination */}
        {data.pageCount > 1 ? (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              Showing {firstOnPage}-{lastOnPage} of {data.total} enquiries · page {data.page} of {data.pageCount}
            </p>
            <div className="flex items-center gap-2">
              {data.page > 1 ? (
                <Link href={enquiryHref(filters, { page: data.page - 1 })} className="btn-outline text-xs">
                  <ChevronLeft size={14} /> Previous
                </Link>
              ) : (
                <span className="btn-outline pointer-events-none text-xs opacity-40"><ChevronLeft size={14} /> Previous</span>
              )}
              {data.page < data.pageCount ? (
                <Link href={enquiryHref(filters, { page: data.page + 1 })} className="btn-outline text-xs">
                  Next <ChevronRight size={14} />
                </Link>
              ) : (
                <span className="btn-outline pointer-events-none text-xs opacity-40">Next <ChevronRight size={14} /></span>
              )}
            </div>
          </nav>
        ) : null}

        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
        <Icon size={13} /> {label}
      </dt>
      <dd className="mt-1 text-sm leading-6">{children}</dd>
    </div>
  );
}
