import "server-only";

import { dbConnect } from "@/lib/db";
import {
  CONTACT_PAGE_SIZE,
  CONTACT_STATUSES,
  CONTACT_INTEREST_VALUES,
  type ContactStatus,
} from "@/lib/contactEnquiries";
import { ContactMessage } from "@/models/ContactMessage";

/**
 * Reading the contact inbox.
 *
 * Paginated in the database rather than in the page: this collection only grows,
 * and a `find({})` that loads every enquiry to slice twenty of them gets slower
 * every week the form is live.
 */

export type EnquiryFilters = {
  page: number;
  status: ContactStatus | "all";
  interest: string | "all";
  query: string;
};

export type EnquiryRow = {
  id: string;
  name: string;
  email: string;
  address: string;
  countryCode: string;
  phone: string;
  interest: string;
  message: string;
  status: ContactStatus;
  handledByName: string;
  handledAt: string | null;
  createdAt: string;
};

export type EnquiryPage = {
  rows: EnquiryRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Counts for the whole collection, not the current filter - they are the tabs. */
  statusCounts: Record<ContactStatus | "all", number>;
};

/** Anything a reader can type into a URL, turned into something safe to query with. */
export function parseEnquiryFilters(params: Record<string, string | string[] | undefined>): EnquiryFilters {
  const single = (key: string) => {
    const value = params[key];
    return String(Array.isArray(value) ? value[0] : value || "").trim();
  };
  const status = single("status");
  const interest = single("interest");
  const page = Number.parseInt(single("page") || "1", 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    status: (CONTACT_STATUSES as readonly string[]).includes(status) ? (status as ContactStatus) : "all",
    interest: CONTACT_INTEREST_VALUES.includes(interest) ? interest : "all",
    query: single("q").slice(0, 80),
  };
}

/** Escaped, so a search for "a+b" or "(" cannot throw or scan the collection oddly. */
function searchRegex(query: string) {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export async function getEnquiryPage(filters: EnquiryFilters): Promise<EnquiryPage> {
  await dbConnect();

  const where: Record<string, unknown> = {};
  if (filters.status !== "all") where.status = filters.status;
  if (filters.interest !== "all") where.interest = filters.interest;
  if (filters.query) {
    const pattern = searchRegex(filters.query);
    where.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { address: pattern }, { message: pattern }];
  }

  const [total, docs, grouped] = await Promise.all([
    ContactMessage.countDocuments(where),
    ContactMessage.find(where)
      .sort({ createdAt: -1 })
      .skip((filters.page - 1) * CONTACT_PAGE_SIZE)
      .limit(CONTACT_PAGE_SIZE)
      .lean(),
    ContactMessage.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const statusCounts = { all: 0, new: 0, contacted: 0, closed: 0 } as Record<ContactStatus | "all", number>;
  for (const entry of grouped as Array<{ _id: string; count: number }>) {
    if (entry._id in statusCounts) statusCounts[entry._id as ContactStatus] = entry.count;
    statusCounts.all += entry.count;
  }

  return {
    rows: (docs as any[]).map((doc) => ({
      id: String(doc._id),
      name: String(doc.name || ""),
      email: String(doc.email || ""),
      address: String(doc.address || ""),
      countryCode: String(doc.countryCode || ""),
      phone: String(doc.phone || ""),
      interest: String(doc.interest || ""),
      message: String(doc.message || ""),
      status: (doc.status || "new") as ContactStatus,
      handledByName: String(doc.handledByName || ""),
      handledAt: doc.handledAt ? new Date(doc.handledAt).toISOString() : null,
      createdAt: new Date(doc.createdAt).toISOString(),
    })),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / CONTACT_PAGE_SIZE)),
    pageSize: CONTACT_PAGE_SIZE,
    statusCounts,
  };
}

/** Rebuilds the current URL with one filter changed, so links keep the rest. */
export function enquiryHref(filters: EnquiryFilters, overrides: Partial<EnquiryFilters>) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.interest !== "all") params.set("interest", merged.interest);
  if (merged.query) params.set("q", merged.query);
  if (merged.page > 1) params.set("page", String(merged.page));
  const search = params.toString();
  return search ? `/sales/enquiries?${search}` : "/sales/enquiries";
}
