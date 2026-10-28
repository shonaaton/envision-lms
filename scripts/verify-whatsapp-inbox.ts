/** Isolated MongoDB integration check. Never loads the LMS environment or
 * connects to its database. Supply a local mongod with WHATSAPP_TEST_MONGO_BINARY.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { WhatsAppMessage } from "../src/models/WhatsApp";
import { WhatsAppConversation, WhatsAppInboxSync, WhatsAppReadState } from "../src/models/WhatsAppConversation";
import { isWhatsAppResolved, needsWhatsAppReply, syncWhatsAppConversations } from "../src/lib/whatsappInbox";
import { WhatsAppSendRequest, withWhatsAppSendRequest } from "../src/lib/whatsappSendRequest";
import { whatsAppDeliveryUpdate } from "../src/lib/whatsappDeliveryStatus";

async function main() {
  const binary = process.env.WHATSAPP_TEST_MONGO_BINARY || path.join(os.homedir(), ".cache", "mongodb-binaries", "mongod-x64-win32-7.0.24.exe");
  if (!fs.existsSync(binary)) throw new Error("Set WHATSAPP_TEST_MONGO_BINARY to a local mongod executable.");
  const temporaryRoot = path.resolve(os.tmpdir());
  const dbPath = fs.mkdtempSync(path.join(temporaryRoot, "whatsapp-inbox-"));
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const mongo = spawn(binary, ["--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1", "--noauth", "--quiet"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  const capture = (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); };
  mongo.stdout.on("data", capture); mongo.stderr.on("data", capture);
  mongo.on("error", (error) => { diagnostics += error.message; });
  try {
    let connected = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { await mongoose.connect(`mongodb://127.0.0.1:${port}/whatsapp_isolated_test`, { serverSelectionTimeoutMS: 500 }); connected = true; break; }
      catch (error) { diagnostics = (diagnostics + String(error)).slice(-4000); if (mongo.exitCode !== null) break; await new Promise((resolve) => setTimeout(resolve, 200)); }
    }
    assert(connected, `Isolated MongoDB did not start: ${diagnostics}`);
    await Promise.all([WhatsAppMessage.init(), WhatsAppConversation.init(), WhatsAppReadState.init(), WhatsAppInboxSync.init(), WhatsAppSendRequest.init()]);
    const baseTime = Date.now() - 3600_000;
    const phoneA = "919999999991", phoneB = "919999999992";
    await WhatsAppMessage.insertMany([
      { phoneNumber: phoneA, direction: "inbound", text: "Customer reply before 450 outgoing messages", receivedAt: new Date(baseTime), createdAt: new Date(baseTime), updatedAt: new Date(baseTime) },
      { phoneNumber: phoneB, direction: "inbound", text: "Older contact outside the former scan limit", createdAt: new Date(baseTime), updatedAt: new Date(baseTime), receivedAt: new Date(baseTime) },
      ...Array.from({ length: 450 }, (_, i) => ({ phoneNumber: phoneA, direction: "outbound", text: `Outgoing ${i}`, status: "sent", messageType: "template", createdAt: new Date(baseTime + i * 1000 + 1), updatedAt: new Date(baseTime + i * 1000 + 1) })),
    ]);
    await Promise.all([syncWhatsAppConversations(), syncWhatsAppConversations()]);
    const summaries: any[] = await WhatsAppConversation.find({}).lean();
    assert.equal(summaries.length, 2, "Older contacts must remain in the inbox");
    const summaryA = summaries.find((item) => item.phoneNumber === phoneA)!;
    assert.equal(summaryA.sentTemplateCount, 450);
    assert.equal(new Date(summaryA.lastInboundAt).getTime(), baseTime, "Window must use complete inbound history");
    assert.equal(summaryA.inboundCount, 1);
    assert.equal(needsWhatsAppReply(summaryA, false), false);
    const summaryB = summaries.find((item) => item.phoneNumber === phoneB)!;
    await WhatsAppConversation.updateOne({ phoneNumber: phoneB }, { $set: { resolvedAt: new Date(), resolvedThroughInboundId: summaryB.lastInboundId } });
    await WhatsAppMessage.create({ phoneNumber: phoneA, direction: "outbound", text: "Failed reply", status: "failed" });
    await syncWhatsAppConversations();
    assert.equal(isWhatsAppResolved((await WhatsAppConversation.findOne({ phoneNumber: phoneB }).lean())!), true, "Sync preserves staff resolution");
    await WhatsAppMessage.create({ phoneNumber: phoneB, direction: "inbound", text: "New question", receivedAt: new Date() });
    await syncWhatsAppConversations();
    const reopened: any = await WhatsAppConversation.findOne({ phoneNumber: phoneB }).lean();
    assert.equal(isWhatsAppResolved(reopened), false, "A new inbound message reopens a resolved conversation");
    assert.equal(needsWhatsAppReply(reopened, false), true);
    assert.equal(reopened.inboundCount, 2);
    await WhatsAppReadState.updateOne({ actorId: "staff-a", phoneNumber: phoneB }, { $max: { readInboundCount: 2, readThroughInboundId: reopened.lastInboundId } }, { upsert: true });
    await WhatsAppReadState.updateOne({ actorId: "staff-a", phoneNumber: phoneB }, { $max: { readInboundCount: 1, readThroughInboundId: summaryB.lastInboundId } }, { upsert: true });
    assert.equal((await WhatsAppReadState.findOne({ actorId: "staff-a", phoneNumber: phoneB }).lean() as any).readInboundCount, 2, "Late receipts cannot undo a newer read watermark");

    let providerCalls = 0;
    let finish!: (result: any) => void;
    const input = { key: "integration-request-12345", actorId: "staff-a", kind: "reply" as const, payload: { text: "Only once" } };
    const send = () => { providerCalls++; return new Promise<any>((resolve) => { finish = resolve; }); };
    const first = withWhatsAppSendRequest(input, send);
    for (let i = 0; i < 100 && !finish; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert(finish, "First request must acquire its reservation");
    assert.equal((await withWhatsAppSendRequest(input, send)).status, 409);
    finish({ body: { ok: true, messageId: "accepted-once" } });
    assert.equal((await first).status, 200);
    assert.equal((await (await withWhatsAppSendRequest(input, send)).json()).messageId, "accepted-once");
    assert.equal(providerCalls, 1);
    const delivered = await WhatsAppMessage.create({ phoneNumber: phoneA, direction: "outbound", status: "sent", metaMessageId: "isolated-receipt-1", rawPayload: { document: { id: "attachment-1" } } });
    for (const status of ["read", "delivered", "sent", "failed"]) {
      const change = whatsAppDeliveryUpdate({ id: "isolated-receipt-1", status });
      await WhatsAppMessage.updateOne(change!.filter, change!.update);
    }
    const received: any = await WhatsAppMessage.findById(delivered._id).lean();
    assert.equal(received.status, "read");
    assert.equal(received.rawPayload.document.id, "attachment-1");
    console.log("PASS: MongoDB backfill beyond 400 messages, accurate reply windows, summary refresh, resolution/reopening, monotonic read/delivery receipts, preserved attachments, and concurrent/replayed send reservations.");
  } finally {
    await mongoose.disconnect();
    if (mongo.pid && mongo.exitCode === null) { const stopped = once(mongo, "exit"); mongo.kill(); await stopped; }
    // Only remove the exact temporary directory created above.
    assert.equal(path.dirname(path.resolve(dbPath)), temporaryRoot);
    assert(path.basename(dbPath).startsWith("whatsapp-inbox-"));
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
