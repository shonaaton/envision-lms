/**
 * User-authorised package corrections, 24 Nov 2026.
 * Preview: node scripts/correct-profitability-packages-20261124.cjs
 * Apply:   node scripts/correct-profitability-packages-20261124.cjs --apply
 * Run in the application environment with MONGODB_URI / MONGODB_DB set.
 * Changes reporting coverage only, never payments, tax amounts or credit balances.
 */
const { MongoClient, ObjectId } = require("mongodb");

const apply = process.argv.includes("--apply");
const cutoff = new Date("2026-11-24T18:29:59.999Z");
const targets = [
  { username: "Aahan@ENV", invoiceId: "6ae19b887812b6cee32b35e8", total: 2500000, gst: 381356, sessions: 96 },
  { username: "Sreenika@ENV", invoiceId: "6abf6527f69755cbea1e8080", total: 800000, gst: 122034, sessions: 24 },
  { username: "Amaan@ENV", invoiceId: "6afde1fc118c20bcac308f99", total: 3434243, gst: 0, sessions: 32 },
  { username: "Rupang@ENV", sessions: 8 },
  { username: "Chitrakshi@ENV", sessions: 8 },
  { username: "Viaan@ENV", useInvoiceCredits: true },
];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "envision_chess");
    const corrections = [];
    for (const target of targets) {
      const students = await db.collection("users").find({ username: target.username }).toArray();
      if (students.length !== 1) throw new Error(`Expected exactly one student: ${target.username}`);
      const student = students[0];
      const query = { student: student._id, status: "paid", issueDate: { $lte: cutoff } };
      if (target.invoiceId) query._id = new ObjectId(target.invoiceId);
      const bill = await db.collection("invoices").find(query).sort({ issueDate: -1, _id: -1 }).limit(1).next();
      if (!bill) throw new Error(`No paid invoice found: ${student.name}`);
      if (target.total !== undefined && (bill.totalAmount !== target.total || Number(bill.gstAmount || 0) !== target.gst)) {
        throw new Error(`Invoice amount or GST changed: ${student.name}; review before applying.`);
      }
      // Never infer a bulk purchase from today's plan or the student's balance.
      const sessions = target.useInvoiceCredits ? Number(bill.coverageSessions || bill.credits) : target.sessions;
      if (!Number.isInteger(sessions) || sessions < 1 || sessions > 1000) {
        throw new Error(`Purchased session count missing on ${student.name}'s invoice ${bill.invoiceNumber}; verify the package before applying.`);
      }
      if (bill.coverageSessions && bill.coverageSessions !== sessions) {
        throw new Error(`Coverage already differs on ${bill.invoiceNumber}; review before applying.`);
      }
      const net = bill.totalAmount - Number(bill.gstAmount || 0) - Number(bill.lateFee || 0);
      corrections.push({ bill, student, sessions });
      console.log(JSON.stringify({ student: student.name, invoice: bill.invoiceNumber, invoiceId: String(bill._id), issueDate: bill.issueDate,
        totalINR: bill.totalAmount / 100, gstINR: Number(bill.gstAmount || 0) / 100,
        sessions, revenuePerClassINR: Math.round(net / sessions) / 100, alreadySet: bill.coverageSessions === sessions }));
    }
    if (!apply) { console.log("Preview only. No records changed."); return; }
    // All targets are checked above before any writes. Conditional updates catch concurrent edits.
    for (const { bill, student, sessions } of corrections) {
      if (bill.coverageSessions === sessions) continue;
      const filter = { _id: bill._id, student: student._id, status: "paid", totalAmount: bill.totalAmount,
        gstAmount: bill.gstAmount ?? { $exists: false }, credits: bill.credits ?? { $exists: false },
        coverageSessions: bill.coverageSessions ?? { $exists: false } };
      const result = await db.collection("invoices").updateOne(filter, { $set: { coverageSessions: sessions, updatedAt: new Date() } });
      if (result.modifiedCount !== 1) throw new Error(`Concurrent change on ${bill.invoiceNumber}; stopped. Earlier successful updates can safely be rerun.`);
      const now = new Date();
      await db.collection("activities").insertOne({ type: "fees.invoice.coverage_updated", targetUser: student._id,
        entityType: "Invoice", entityId: bill._id, label: `Set ${sessions} purchased sessions for ${bill.invoiceNumber}`,
        metadata: { previousCoverageSessions: bill.coverageSessions ?? null, coverageSessions: sessions, source: "correct-profitability-packages-20261124" },
        occurredAt: now, createdAt: now, updatedAt: now });
      const saved = await db.collection("invoices").findOne({ _id: bill._id });
      if (saved.coverageSessions !== sessions) throw new Error(`Read-back verification failed: ${bill.invoiceNumber}`);
      console.log(`Verified ${student.name}: ${sessions} sessions.`);
    }
  } finally { await client.close(); }
}

main().catch((error) => {
  // Do not print connection details or credentials in failures.
  console.error(error.name === "Error" ? error.message : `Database operation failed (${error.name}).`);
  process.exitCode = 1;
});
