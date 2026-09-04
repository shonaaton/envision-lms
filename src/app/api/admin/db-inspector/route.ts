import { NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const MAX_SEARCH_LENGTH = 100;
const SEARCH_FIELDS = [
  "name",
  "email",
  "username",
  "title",
  "phone",
  "parentName",
  "courseName",
  "levelName",
  "status",
  "demoStatus",
  "approvalStatus",
  "bookingType",
  "sessionKey",
  "scheduledSessionId",
  "invoiceNumber",
  "referenceNumber",
];
const DEFAULT_DATE_FIELDS = ["updatedAt", "createdAt", "sessionDate", "scheduledFor", "startAt", "classDate"];
const SENSITIVE_KEY_PARTS = [
  "password",
  "hash",
  "secret",
  "token",
  "signature",
  "apikey",
  "api_key",
  "accesskey",
  "webhook",
  "credential",
  "authorization",
  "razorpaysignature",
];

function cleanToken(value: string | undefined) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function canReadDatabase(req: Request) {
  const configuredToken = cleanToken(process.env.DATABASE_DIAGNOSTIC_TOKEN);
  if (configuredToken.length >= 24 && bearerToken(req) === configuredToken) return true;

  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !["admin", "sub-admin"].includes(String(role || ""))) return false;
  return canAccessFeature("admin", session.user as any, "view");
}

function parseLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(parsed)));
}

function safeCollectionName(value: string | null) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) return "";
  if (name.startsWith("system.")) return "";
  return name;
}

function safeFieldName(value: string | null) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(name)) return "";
  return name;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSort(value: string | null) {
  const raw = String(value || "-updatedAt").trim();
  const direction: 1 | -1 = raw.startsWith("-") ? -1 : 1;
  const field = safeFieldName(raw.replace(/^-/, ""));
  return [field || "updatedAt", direction] as [string, 1 | -1];
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function exactValue(value: string) {
  if (Types.ObjectId.isValid(value)) return new Types.ObjectId(value);
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  if (value.trim() !== "" && Number.isFinite(numeric)) return numeric;
  const date = parseDate(value);
  if (date && /^\d{4}-\d{2}-\d{2}/.test(value)) return date;
  return value;
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9_]/gi, "").toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function redact(value: any): any {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Types.ObjectId.isValid(value) && value?._bsontype === "ObjectId") return value.toString();

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redact(item),
    ])
  );
}

function buildFilter(url: URL) {
  const filter: Record<string, any> = {};
  const id = String(url.searchParams.get("id") || "").trim();
  if (id) {
    if (!Types.ObjectId.isValid(id)) return { error: "Invalid id" };
    filter._id = new Types.ObjectId(id);
  }

  const field = safeFieldName(url.searchParams.get("field"));
  const value = String(url.searchParams.get("value") || "").trim();
  if (field && value) {
    if (isSensitiveKey(field)) return { error: "Filtering by sensitive fields is not allowed" };
    filter[field] = exactValue(value);
  }

  const search = String(url.searchParams.get("search") || "").trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = SEARCH_FIELDS.map((searchField) => ({ [searchField]: regex }));
  }

  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (from || to) {
    const dateField = safeFieldName(url.searchParams.get("dateField")) || DEFAULT_DATE_FIELDS[0];
    filter[dateField] = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  return { filter };
}

export async function GET(req: Request) {
  if (!(await canReadDatabase(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const db = mongoose.connection.db;
  if (!db) return NextResponse.json({ error: "Database connection unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const collectionName = safeCollectionName(url.searchParams.get("collection"));
  const includeCounts = url.searchParams.get("counts") === "true";

  if (!collectionName) {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const visibleCollections = collections
      .map((collection) => collection.name)
      .filter((name) => !name.startsWith("system."))
      .sort();

    const rows = includeCounts
      ? await Promise.all(
          visibleCollections.map(async (name) => ({
            name,
            estimatedDocuments: await db.collection(name).estimatedDocumentCount().catch(() => null),
          }))
        )
      : visibleCollections.map((name) => ({ name }));

    return NextResponse.json({
      mode: "collections",
      count: rows.length,
      collections: rows,
      usage: {
        readCollection: "/api/admin/db-inspector?collection=users&search=Devansh&limit=20",
        exactField: "/api/admin/db-inspector?collection=attendances&field=scheduledSessionId&value=<sessionId>",
        byId: "/api/admin/db-inspector?collection=classrooms&id=<mongoId>",
      },
    });
  }

  const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  if (!collections.length) {
    return NextResponse.json({ error: "Collection not found", collection: collectionName }, { status: 404 });
  }

  const filterResult = buildFilter(url);
  if ("error" in filterResult) return NextResponse.json({ error: filterResult.error }, { status: 400 });

  const limit = parseLimit(url.searchParams.get("limit"));
  const skip = Math.max(0, Math.round(Number(url.searchParams.get("skip") || 0)));
  const sort = parseSort(url.searchParams.get("sort"));
  const documents = await db
    .collection(collectionName)
    .find(filterResult.filter)
    .sort([sort])
    .skip(skip)
    .limit(limit)
    .toArray();

  return NextResponse.json({
    mode: "documents",
    collection: collectionName,
    filters: {
      id: url.searchParams.get("id") || null,
      field: url.searchParams.get("field") || null,
      value: url.searchParams.get("value") || null,
      search: url.searchParams.get("search") || null,
      from: url.searchParams.get("from") || null,
      to: url.searchParams.get("to") || null,
      dateField: url.searchParams.get("dateField") || null,
      sort: url.searchParams.get("sort") || "-updatedAt",
      skip,
      limit,
    },
    count: documents.length,
    redacted: true,
    documents: documents.map((document) => redact(document)),
  });
}
