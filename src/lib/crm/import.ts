import "server-only";

import { emailKey, findUserForCrmContact, phoneKey } from "@/lib/crm/identity";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

/**
 * One-time seed of the lead mirror from a CRM export.
 *
 * Kraya has no list endpoint, so leads that existed before the mirror went live
 * are invisible until somebody edits them and triggers a webhook. Without this,
 * the sales team opens an empty CRM on day one. Exporting from Kraya's own UI and
 * importing here is the only way to get that history in.
 *
 * Backfilling through the upsert endpoint is not an alternative: it writes rather
 * than reads, and with no lead list there would be nothing to iterate over anyway.
 */

export type ImportSummary = { created: number; updated: number; skipped: number; errors: string[] };

/** Minimal RFC4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => String(value).trim() !== ""));
}

function headerKey(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Column headings vary between exports, so each field accepts several spellings. */
const COLUMN_ALIASES: Record<string, string[]> = {
  crmLeadId: ["leadid", "id", "leadno", "leadnumber"],
  name: ["name", "leadname", "fullname", "contactname"],
  phone: ["phone", "phonenumber", "mobile", "contact", "contactnumber"],
  email: ["email", "emailaddress"],
  stage: ["stage", "leadstage", "status"],
  pipeline: ["pipeline"],
  notes: ["notes", "note", "remarks", "comments"],
  createdAt: ["createdat", "created", "createdon", "date", "leadcreatedat"],
};

function buildColumnMap(headers: string[]) {
  const normalized = headers.map(headerKey);
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header));
    if (index >= 0) map[field] = index;
  }
  return { map, normalized };
}

export async function importLeadsFromCsv(text: string): Promise<ImportSummary> {
  const rows = parseCsv(text);
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (rows.length < 2) {
    summary.errors.push("The file has no data rows.");
    return summary;
  }

  const headers = rows[0];
  const { map, normalized } = buildColumnMap(headers);
  if (map.phone === undefined && map.crmLeadId === undefined) {
    summary.errors.push("The file needs at least a lead id or a phone column.");
    return summary;
  }

  const known = new Set(Object.values(map));
  const cell = (row: string[], field: string) => (map[field] === undefined ? "" : String(row[map[field]] ?? "").trim());

  for (const [index, row] of rows.slice(1).entries()) {
    const phone = cell(row, "phone");
    // Without a lead id the phone stands in as the key. It is what Kraya itself
    // matches on, so a later webhook for the same person merges rather than
    // duplicating - once the real id arrives it replaces this placeholder.
    const crmLeadId = cell(row, "crmLeadId") || (phone ? `phone:${phoneKey(phone)}` : "");
    if (!crmLeadId) {
      summary.skipped += 1;
      continue;
    }

    // Every column the importer does not recognise is kept as a custom attribute,
    // the same way unknown webhook keys are.
    const attributes = row.reduce<Record<string, string>>((acc, value, column) => {
      if (known.has(column)) return acc;
      const label = String(headers[column] || normalized[column] || "").trim();
      const cellValue = String(value ?? "").trim();
      if (label && cellValue) acc[label] = cellValue;
      return acc;
    }, {});

    try {
      const existing: any = await CrmLeadRecord.findOne({ crmLeadId });
      const record: any = existing || new CrmLeadRecord({ crmLeadId, stageHistory: [] });
      const stage = cell(row, "stage");
      const createdRaw = cell(row, "createdAt");
      const createdAt = createdRaw && !Number.isNaN(Date.parse(createdRaw)) ? new Date(createdRaw) : new Date();

      record.name = cell(row, "name") || record.name;
      record.pipeline = cell(row, "pipeline") || record.pipeline;
      if (phone) {
        record.phone = phone;
        record.phoneKey = phoneKey(phone);
      }
      const email = cell(row, "email");
      if (email) {
        record.email = email;
        record.emailKey = emailKey(email);
      }
      const notes = cell(row, "notes");
      if (notes) record.notes = notes;
      if (Object.keys(attributes).length) record.attributes = { ...(record.attributes || {}), ...attributes };

      // An import never overwrites a stage the webhook has already delivered -
      // live CRM data is newer and more trustworthy than a static export.
      if (stage && !record.stage) {
        record.stage = stage;
        record.stageChangedAt = createdAt;
        record.stageHistory = [...(record.stageHistory || []), { stage, at: createdAt, source: "import" as const }];
      }
      if (!record.firstSeenAt) record.firstSeenAt = createdAt;
      if (!record.lastEventAt) record.lastEventAt = createdAt;
      if (!existing) record.lastEventType = "import";

      if (!record.portalUser && (phone || email)) {
        const user: any = await findUserForCrmContact({ phone, email }).catch(() => null);
        if (user?._id) record.portalUser = user._id;
      }

      await record.save();
      if (existing) summary.updated += 1;
      else summary.created += 1;
    } catch (error) {
      summary.skipped += 1;
      if (summary.errors.length < 10) {
        summary.errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "could not be imported"}`);
      }
    }
  }

  return summary;
}
