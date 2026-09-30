import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";

import type { PayEvent } from "@/lib/coachPay";
import { migrateCoachSelfView, migrateLegacyCoachPayPermissions } from "@/lib/featureAccess";
import { buildPdf, PdfCanvas, parsePng } from "@/lib/pdf/simplePdf";
import {
  ACADEMY_BILL_TO,
  amountInWordsINR,
  buildInvoiceLines,
  eligibleInvoiceMonths,
  groupInvoiceLines,
  incrementInvoiceNumber,
  invoiceDateLabel,
  invoiceEmailSubject,
  invoiceFileName,
  isInvoiceMonthOpen,
  payoutProfileSchema,
} from "@/lib/staffInvoice";
import { renderStaffInvoicePdf } from "@/lib/staffInvoicePdf";

function event(overrides: Partial<PayEvent>): PayEvent {
  return {
    id: Math.random().toString(36),
    date: new Date("2026-09-10T12:00:00Z"),
    coachId: "coach",
    coachName: "Coach",
    classroomId: "room-a",
    classroomTitle: "Beginner L1 - Mon/Wed",
    isDemoClass: false,
    batchName: "Batch A",
    sessionId: Math.random().toString(36),
    sessionNumber: 1,
    topicName: "",
    sessionStatus: "completed",
    kind: "regular",
    status: "payable",
    minutes: 60,
    unit: "per_class",
    rateAmount: 50000,
    amount: 50000,
    exposure: 50000,
    rateSource: "classroom_coach",
    isSubstitution: false,
    substitutedForName: "",
    studentCount: 4,
    note: "",
    ...overrides,
  };
}

describe("amountInWordsINR", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [100, "Rupees One Only"],
    [1500, "Rupees Fifteen Only"],
    [10000, "Rupees One Hundred Only"],
    [1250000, "Rupees Twelve Thousand Five Hundred Only"],
    [1250050, "Rupees Twelve Thousand Five Hundred and Fifty Paise Only"],
    [10000000, "Rupees One Lakh Only"],
    [123456789, "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only"],
    [1000000000, "Rupees One Crore Only"],
    [150000000000, "Rupees One Hundred Fifty Crore Only"],
  ])("writes %i paise as %s", (paise, words) => {
    expect(amountInWordsINR(paise)).toBe(words);
  });
});

describe("invoice numbering and naming", () => {
  it("increments the last run of digits, keeping its padding", () => {
    expect(incrementInvoiceNumber("SC-009")).toBe("SC-010");
    expect(incrementInvoiceNumber("ECA/2026/7")).toBe("ECA/2026/8");
    expect(incrementInvoiceNumber("99")).toBe("100");
    expect(incrementInvoiceNumber("INV-001A")).toBe("INV-002A");
    expect(incrementInvoiceNumber("INV")).toBe("INV-2");
  });

  it("names the file firstname_lastname_month_year", () => {
    expect(invoiceFileName("Sayantan Kumar Chandra", "2026-09")).toBe("Sayantan_Chandra_September_2026.pdf");
    expect(invoiceFileName("  Madhu  ", "2026-12")).toBe("Madhu_December_2026.pdf");
  });

  it("builds the email subject", () => {
    expect(invoiceEmailSubject({ invoiceNumber: "SC-010", fullName: "Sayantan Chandra ", month: "2026-09" })).toBe(
      "Invoice SC-010 | Sayantan Chandra | September 2026"
    );
  });

  it("dates an invoice on the last day of its month", () => {
    expect(invoiceDateLabel("2026-09")).toBe("30 Sep 2026");
    expect(invoiceDateLabel("2028-02")).toBe("29 Feb 2028");
  });
});

describe("which months can be invoiced", () => {
  it("opens a month on its last day in Kolkata, not before", () => {
    // 29 Sept 23:00 IST is still the 29th; 30 Sept 00:30 IST is the last day.
    expect(isInvoiceMonthOpen("2026-09", new Date("2026-09-29T17:30:00Z"))).toBe(false);
    expect(isInvoiceMonthOpen("2026-09", new Date("2026-09-29T19:00:00Z"))).toBe(true);
  });

  it("offers last month until the current one reaches its last day, across the year", () => {
    const early = eligibleInvoiceMonths(new Date("2027-01-05T06:00:00Z"), 3).map((item) => item.month);
    expect(early).toEqual(["2026-12", "2026-11", "2026-10"]);
    const lastDay = eligibleInvoiceMonths(new Date("2026-12-31T06:00:00Z"), 2).map((item) => item.month);
    expect(lastDay).toEqual(["2026-12", "2026-11"]);
  });
});

describe("groupInvoiceLines", () => {
  it("makes one row per classroom and price, and one row for all demos", () => {
    const { groups, pending } = groupInvoiceLines([
      event({}),
      event({}),
      event({ classroomId: "room-b", classroomTitle: "Advanced", amount: 80000, rateAmount: 80000 }),
      event({ classroomId: "demo-1", classroomTitle: "Demo - Riya", kind: "demo", isDemoClass: true, amount: 30000 }),
      event({ classroomId: "demo-2", classroomTitle: "Demo - Aarav", kind: "demo", isDemoClass: true, amount: 30000 }),
      event({ status: "pending_review", amount: 0, exposure: 50000 }),
      event({ status: "declined", amount: 0, exposure: 50000 }),
    ]);
    expect(groups.map((group) => [group.title, group.quantity, group.rate, group.amount])).toEqual([
      ["Advanced", 1, 80000, 80000],
      ["Beginner L1 - Mon/Wed", 2, 50000, 100000],
      ["Demo classes", 2, 30000, 60000],
    ]);
    expect(pending).toEqual({ count: 1, amount: 50000 });
  });

  it("asks for a rate on unpriced classes, keeping their sessions for the proposal", () => {
    const { groups } = groupInvoiceLines([
      event({ status: "unpriced", amount: 0, exposure: 0, rateAmount: 0, rateSource: "none", sessionId: "s1" }),
      event({ status: "unpriced", amount: 0, exposure: 0, rateAmount: 0, rateSource: "none", sessionId: "s2" }),
      event({ kind: "demo", isDemoClass: true, classroomId: "demo-1", status: "unpriced", amount: 0, exposure: 0 }),
    ]);
    const regular = groups.find((group) => group.kind === "regular")!;
    expect(regular).toMatchObject({ key: "regular:room-a:unpriced", needsRate: true, rate: null, quantity: 2 });
    expect(regular.sessions.map((session) => session.sessionId)).toEqual(["s1", "s2"]);
    expect(groups.find((group) => group.group === "demo")?.key).toBe("demo:unpriced");
  });

  it("keeps a batch on one row when one of its classes has no rate on record", () => {
    const priced = { classroomId: "pic-99991", classroomTitle: "PIC-99991", amount: 60000, rateAmount: 60000, minutes: 45 };
    const { groups } = groupInvoiceLines([
      event(priced),
      event(priced),
      event(priced),
      event(priced),
      event({ ...priced, status: "unpriced", amount: 0, exposure: 0, rateAmount: 0, rateSource: "none", sessionId: "moved-class" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ title: "PIC-99991", quantity: 5, minutes: 225, rate: 60000, amount: 300000, needsRate: false });
    expect(groups[0].inferredSessions.map((session) => session.sessionId)).toEqual(["moved-class"]);

    const { lines, missing } = buildInvoiceLines(groups, {}, []);
    expect(missing).toEqual([]);
    expect(lines[0].amount).toBe(300000);
  });

  it("keeps two rows only when the batch really had two rates in the month", () => {
    const room = { classroomId: "pic-1", classroomTitle: "PIC-1" };
    const { groups } = groupInvoiceLines([
      event({ ...room, amount: 50000 }),
      event({ ...room, amount: 60000 }),
      event({ ...room, status: "unpriced", amount: 0, exposure: 0 }),
    ]);
    expect(groups.map((group) => [group.rate, group.quantity, group.needsRate])).toEqual([
      [50000, 1, false],
      [60000, 1, false],
      [null, 1, true],
    ]);
  });

  it("prices entered rates and adds manual items; missing rates block the invoice", () => {
    const { groups } = groupInvoiceLines([
      event({}),
      event({ status: "unpriced", amount: 0, exposure: 0, classroomId: "room-c", classroomTitle: "Intermediate" }),
      event({ status: "unpriced", amount: 0, exposure: 0, classroomId: "room-c", classroomTitle: "Intermediate" }),
    ]);
    const blocked = buildInvoiceLines(groups, {}, []);
    expect(blocked.missing).toEqual(["regular:room-c:unpriced"]);

    const done = buildInvoiceLines(groups, { "regular:room-c:unpriced": 40000 }, [{ description: "Travel", quantity: 2, rate: 15000 }]);
    expect(done.missing).toEqual([]);
    expect(done.lines.map((line) => [line.title, line.rateSource, line.amount])).toEqual([
      ["Beginner L1 - Mon/Wed", "academy", 50000],
      ["Intermediate", "coach_entered", 80000],
      ["Travel", "manual", 30000],
    ]);
    expect(done.total).toBe(160000);
  });
});

describe("payoutProfileSchema", () => {
  const valid = {
    fullName: "Sayantan Chandra",
    address: "12 Park Street, Kolkata 700016",
    pan: "abcde1234f",
    nextInvoiceNumber: "SC-001",
    bankName: "State Bank of India",
    accountNumber: "1234 5678 9012",
    branchName: "Park Street",
    ifsc: "sbin0001234",
    accountType: "savings",
  };

  it("normalises PAN, IFSC and account number", () => {
    const parsed = payoutProfileSchema.parse(valid);
    expect(parsed.pan).toBe("ABCDE1234F");
    expect(parsed.ifsc).toBe("SBIN0001234");
    expect(parsed.accountNumber).toBe("123456789012");
  });

  it.each([
    ["pan", "ABCD1234F"],
    ["ifsc", "SBIN1001234"],
    ["accountNumber", "12345"],
    ["accountType", "fixed"],
  ])("rejects a bad %s", (field, value) => {
    expect(payoutProfileSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe("coaches see their own pay", () => {
  it("guarantees a coach `view` and never hands them the whole payroll", () => {
    expect(migrateCoachSelfView([])).toEqual(["view"]);
    expect(migrateCoachSelfView(undefined)).toEqual(["view"]);
    expect(migrateCoachSelfView(["view_own"])).toEqual(["view"]);
    expect(migrateCoachSelfView(["view", "export"])).toEqual(["view", "export"]);
    expect(migrateCoachSelfView(["export"])).not.toContain("view_all");
  });
});

describe("legacy Coach Pay permissions", () => {
  it("turns the first release's grants into today's meaning", () => {
    expect(migrateLegacyCoachPayPermissions(["view_own"])).toEqual(["view"]);
    expect(migrateLegacyCoachPayPermissions(["view", "view_own", "manage_rates", "rule", "export"]).sort()).toEqual(
      ["export", "manage_rates", "rule", "view", "view_all"].sort()
    );
    // Sub-admins held the old `view` alone: that was the whole payroll.
    expect(migrateLegacyCoachPayPermissions(["view", "export"]).sort()).toEqual(["export", "view", "view_all"]);
    expect(migrateLegacyCoachPayPermissions([])).toEqual([]);
    expect(migrateLegacyCoachPayPermissions(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PDF

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A tiny RGBA PNG, as a browser canvas would produce. */
function pngDataUrl(width = 4, height = 2) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows.set([10, 20, 30, 255], y * (width * 4 + 1) + 1 + x * 4);
  }
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function pageCount(pdf: Buffer) {
  return Number(pdf.toString("binary").match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)?.[1] || 0);
}

function xrefIsConsistent(pdf: Buffer) {
  const text = pdf.toString("binary");
  const start = Number(text.match(/startxref\n(\d+)/)?.[1]);
  if (!text.startsWith("xref", start)) return false;
  const offsets = text.slice(start).split("\n").slice(3).filter((line) => / 00000 n $/.test(line)).map((line) => Number(line.slice(0, 10)));
  return offsets.every((offset, index) => text.startsWith(`${index + 1} 0 obj`, offset));
}

describe("buildPdf", () => {
  it("writes several pages with a consistent cross-reference table", () => {
    const pages = [new PdfCanvas(), new PdfCanvas(), new PdfCanvas()];
    pages.forEach((page, index) => page.text(`Page ${index + 1}`, 40, 40));
    const pdf = buildPdf(pages.map((page) => page.output()));
    expect(pdf.toString("binary").startsWith("%PDF-1.4")).toBe(true);
    expect(pageCount(pdf)).toBe(3);
    expect(xrefIsConsistent(pdf)).toBe(true);
  });
});

describe("renderStaffInvoicePdf", () => {
  function invoice(lineCount: number) {
    return {
      month: "2026-09",
      invoiceNumber: "SC-010",
      billFrom: {
        fullName: "Sayantan Chandra",
        address: "12 Park Street\nKolkata 700016",
        pan: "ABCDE1234F",
        email: "coach@example.com",
        phone: "+91 90000 00000",
        bank: { accountHolder: "Sayantan Chandra", bankName: "SBI", accountNumber: "123456789012", branchName: "Park Street", ifsc: "SBIN0001234", accountType: "savings" },
      },
      billTo: ACADEMY_BILL_TO,
      signature: pngDataUrl(),
      lines: Array.from({ length: lineCount }, (_, index) => ({
        group: "class",
        kind: "regular",
        title: `Classroom ${index + 1}`,
        batchName: "Batch",
        quantity: 4,
        minutes: 240,
        rate: 50000,
        amount: 200000,
        rateSource: "academy",
      })),
      total: lineCount * 200000,
      totalInWords: amountInWordsINR(lineCount * 200000),
    };
  }

  it("embeds the signature and prints on one page for a normal month", () => {
    expect(parsePng(Buffer.from(pngDataUrl().split(",")[1], "base64"), "x")).not.toBeNull();
    const pdf = renderStaffInvoicePdf(invoice(5));
    const text = pdf.toString("binary");
    expect(pageCount(pdf)).toBe(1);
    expect(text).toContain("/ImSign");
    expect(text).toContain("(Envision Chess Academy) Tj");
    expect(text).toContain("(PAN: AALFE6840P) Tj");
    expect(text).toContain("(INR 10,000.00) Tj");
    expect(text).toContain("(Rupees Ten Thousand Only) Tj");
    expect(xrefIsConsistent(pdf)).toBe(true);
  });

  it("carries a long table onto further pages", () => {
    const pdf = renderStaffInvoicePdf(invoice(40));
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(pdf.toString("binary")).toContain("(Classroom 40) Tj");
    expect(xrefIsConsistent(pdf)).toBe(true);
  });
});
