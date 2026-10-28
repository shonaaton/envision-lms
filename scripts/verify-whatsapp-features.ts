import assert from "node:assert/strict";
import { withIsolatedMongo } from "./lib/withIsolatedMongo";
import { User } from "../src/models/User";
import { WhatsAppTemplate } from "../src/models/WhatsAppTemplate";
import { WhatsAppMessage } from "../src/models/WhatsApp";
import { WhatsAppConversation } from "../src/models/WhatsAppConversation";
import { WhatsAppCampaign, WhatsAppCampaignRecipient, WhatsAppPrivateNote, WhatsAppSavedReply } from "../src/models/WhatsAppWorkspace";
import { Notification } from "../src/models/Fee";
import { syncTemplateLibrary, getApprovedLibraryTemplate, serializeLibraryTemplate } from "../src/lib/whatsappTemplateLibrary";
import { saveCampaignPreview, processWhatsAppCampaigns, processWhatsAppFollowUps, resumeWhatsAppCampaignRetry } from "../src/lib/whatsappCampaigns";
import { sendLibraryTemplate } from "../src/lib/whatsappLibrarySend";
import { whatsAppDeliveryUpdate } from "../src/lib/whatsappDeliveryStatus";
import { syncCampaignDelivery } from "../src/lib/whatsappCampaignDelivery";
import { syncWhatsAppConversations } from "../src/lib/whatsappInbox";

async function main() {
  await withIsolatedMongo(async (uri) => {
    const environment = { MONGODB_URI: uri, MONGODB_DB: "whatsapp_feature_test", WHATSAPP_ACCESS_TOKEN: "isolated-fake-token", WHATSAPP_BUSINESS_ACCOUNT_ID: "isolated-waba", WHATSAPP_PHONE_NUMBER_ID: "isolated-phone", WHATSAPP_GRAPH_VERSION: "v25.0" };
    const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
    Object.assign(process.env, environment);
    const originalFetch = globalThis.fetch;
    const remote: any = { id: "isolated-template", name: "class_update", language: "en_US", category: "UTILITY", status: "PENDING", components: [{ type: "BODY", text: "Hello {{1}}, your class starts at 6 PM.", example: { body_text: [["Aarav"]] } }] };
    const calls: { to: string; body: any; id?: string }[] = [];
    const fail = new Set<string>(); const uncertain = new Set<string>();
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "graph.facebook.com", "This test must intercept every provider request");
      assert.equal((init?.headers as any).Authorization, "Bearer isolated-fake-token");
      if (init?.method === "POST" && url.pathname.endsWith("/messages")) {
        const body = JSON.parse(String(init.body));
        const call = { to: body.to, body, id: `isolated-send-${calls.length + 1}` }; calls.push(call);
        if (uncertain.has(body.to)) throw new TypeError("Simulated lost provider response");
        if (fail.has(body.to)) return Response.json({ error: { message: "Recipient unavailable" } }, { status: 400 });
        return Response.json({ messages: [{ id: call.id }] });
      }
      if (url.pathname.endsWith("/message_templates")) return Response.json({ data: [remote] });
      if (url.pathname.endsWith("/isolated-template")) return Response.json(remote);
      throw new Error(`Unexpected isolated test request: ${url.pathname}`);
    };
    try {
      await Promise.all([User.init(), WhatsAppTemplate.init(), WhatsAppMessage.init(), WhatsAppCampaign.init(), WhatsAppCampaignRecipient.init(), WhatsAppPrivateNote.init(), WhatsAppSavedReply.init(), Notification.init()]);
      const actor: any = await User.create({ name: "Test Admin", username: "admin-test", email: "admin@isolated.test", role: "admin", passwordHash: "not-a-real-password", isActive: true });
      const alice: any = await User.create({ name: "Aarav", parentName: "Parent Alpha", username: "aarav-test", email: "aarav@isolated.test", phone: "9999999991", countryCode: "+91", role: "student", passwordHash: "not-a-real-password", isActive: true });
      const bob: any = await User.create({ name: "Ishaan", parentName: "Parent Beta", username: "ishaan-test", email: "ishaan@isolated.test", phone: "9999999992", countryCode: "+91", role: "student", passwordHash: "not-a-real-password", isActive: true });
      await WhatsAppTemplate.create({ businessAccountId: "isolated-waba", name: remote.name, language: remote.language, category: remote.category, body: remote.components[0].text, variables: [{ position: 1, key: "Student name", sample: "Aarav" }], status: "DRAFT" });
      await syncTemplateLibrary();
      const pending: any = await WhatsAppTemplate.findOne({ name: remote.name }).lean();
      assert.equal(pending.status, "PENDING"); assert.equal(serializeLibraryTemplate(pending).sendable, false);
      await assert.rejects(() => getApprovedLibraryTemplate(String(pending._id)), /pending/);
      assert.equal(calls.length, 0, "A pending template must never reach the sending API");
      remote.status = "APPROVED"; await syncTemplateLibrary();
      const template = await getApprovedLibraryTemplate(String(pending._id));
      assert.equal(template.language, "en_US"); assert.equal(template.sendable, true);
      const direct = await sendLibraryTemplate({ template, phoneNumber: "919999999991", values: ["Aarav"], actorId: String(actor._id) });
      assert.equal(direct.ok, true); assert.equal(calls[0].body.template.language.code, "en_US");
      assert.equal(calls[0].body.template.components[0].parameters[0].text, "Aarav");

      const preview = await saveCampaignPreview({ name: "Class update", templateId: template.id, recipientGroup: "manual", recipients: ["919999999991", "919999999992", "919999999991"], variableInputs: ["{name}"], requestId: "isolated-preview-123456" }, String(actor._id));
      assert.equal(preview.recipientCount, 2, "Shared or duplicated numbers receive only one broadcast message");
      assert.equal(preview.recipients[0].values[0], "Aarav"); assert.equal(preview.recipients[1].values[0], "Ishaan");
      assert.equal(preview.excluded.length, 1); assert.equal(calls.length, 1, "Preview must never send");
      await WhatsAppCampaign.updateOne({ _id: preview.campaignId }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
      fail.add("919999999992");
      await Promise.all([processWhatsAppCampaigns(), processWhatsAppCampaigns()]);
      assert.equal(calls.length, 3, "Concurrent workers must each claim a recipient once");
      assert.equal(calls.filter((call) => call.to === "919999999991").length, 2);
      const firstWave: any[] = await WhatsAppCampaignRecipient.find({ campaignId: preview.campaignId }).sort({ phoneNumber: 1 }).lean();
      assert.equal(firstWave[0].state, "accepted"); assert.equal(firstWave[1].state, "failed");
      const receipt = whatsAppDeliveryUpdate({ id: firstWave[0].metaMessageId, status: "read" })!;
      await WhatsAppMessage.updateOne(receipt.filter, receipt.update); await syncCampaignDelivery(firstWave[0].metaMessageId);
      assert.equal((await WhatsAppCampaignRecipient.findById(firstWave[0]._id).lean() as any).state, "read");
      const oldFailed: any = await WhatsAppMessage.findById(firstWave[1].messageId).lean();
      await WhatsAppCampaign.updateOne({ _id: preview.campaignId }, { $set: { status: "retrying", previewReady: false } });
      await resumeWhatsAppCampaignRetry(preview.campaignId); fail.clear(); await processWhatsAppCampaigns();
      assert.equal(calls.length, 4, "Retry must target only the confirmed failure");
      const retried: any = await WhatsAppCampaignRecipient.findById(firstWave[1]._id).lean();
      assert.equal(retried.attempt, 1); assert.equal(retried.state, "accepted");
      if (oldFailed.metaMessageId) await syncCampaignDelivery(oldFailed.metaMessageId);
      assert.equal((await WhatsAppCampaignRecipient.findById(retried._id).lean() as any).state, "accepted");
      await processWhatsAppCampaigns(); assert.equal(calls.length, 4, "Completed jobs must not resend");

      const unknownPreview = await saveCampaignPreview({ name: "Unknown outcome", templateId: template.id, recipientGroup: "manual", recipients: ["919999999992"], variableInputs: ["Ishaan"], requestId: "isolated-unknown-123456" }, String(actor._id));
      await WhatsAppCampaign.updateOne({ _id: unknownPreview.campaignId }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
      uncertain.add("919999999992"); await processWhatsAppCampaigns();
      const unknown: any = await WhatsAppCampaignRecipient.findOne({ campaignId: unknownPreview.campaignId }).lean(); assert.equal(unknown.state, "unconfirmed");
      const beforeRetry = calls.length;
      await WhatsAppCampaign.updateOne({ _id: unknownPreview.campaignId }, { $set: { status: "retrying" } });
      await resumeWhatsAppCampaignRetry(unknownPreview.campaignId); await processWhatsAppCampaigns();
      assert.equal(calls.length, beforeRetry, "Unconfirmed sends are excluded from automatic retries");

      await User.updateOne({ _id: bob._id }, { $set: { "engagementOptOut.optedOut": true } });
      const categoryPreview = await saveCampaignPreview({ name: "Category change", templateId: template.id, recipientGroup: "students", variableInputs: ["{name}"], requestId: "isolated-category-123456" }, String(actor._id));
      await WhatsAppCampaign.updateOne({ _id: categoryPreview.campaignId }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
      remote.category = "MARKETING"; await syncTemplateLibrary();
      const beforeCategoryCheck = calls.length; await processWhatsAppCampaigns();
      assert.equal(calls.length, beforeCategoryCheck, "Meta recategorisation must require a fresh preview");
      assert.match((await WhatsAppCampaign.findById(categoryPreview.campaignId).lean() as any).lastError, /changed after preview/);
      await WhatsAppCampaign.updateOne({ _id: categoryPreview.campaignId }, { $set: { status: "cancelled" } });
      const marketing = await saveCampaignPreview({ name: "Announcement", templateId: template.id, recipientGroup: "students", variableInputs: ["{name}"], requestId: "isolated-marketing-123456" }, String(actor._id));
      assert.equal(marketing.recipientCount, 1); assert(marketing.excluded.some((entry) => entry.reason === "Opted out of updates"));
      await WhatsAppCampaign.updateOne({ _id: marketing.campaignId }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
      await User.updateOne({ _id: alice._id }, { $set: { "engagementOptOut.optedOut": true } });
      await processWhatsAppCampaigns();
      assert.equal(calls.length, beforeCategoryCheck, "An opt-out after scheduling must prevent the marketing send");
      assert.equal((await WhatsAppCampaignRecipient.findOne({ campaignId: marketing.campaignId }).lean() as any).state, "cancelled");
      await User.updateOne({ _id: alice._id }, { $set: { "engagementOptOut.optedOut": false } });
      const denied = await saveCampaignPreview({ name: "Permission revoked", templateId: template.id, recipientGroup: "students", variableInputs: ["{name}"], requestId: "isolated-denied-123456" }, String(actor._id));
      await WhatsAppCampaign.updateOne({ _id: denied.campaignId }, { $set: { status: "scheduled", scheduledAt: new Date(Date.now() - 1000) } });
      await processWhatsAppCampaigns(async () => false);
      assert.equal((await WhatsAppCampaign.findById(denied.campaignId).lean() as any).status, "cancelled");
      assert.equal(calls.length, beforeCategoryCheck, "Revoked broadcast permission must cancel pending sends");
      remote.category = "UTILITY";

      await syncWhatsAppConversations();
      await WhatsAppConversation.updateOne({ phoneNumber: "919999999991" }, { $set: { assignedTo: actor._id, linkedManually: true, linkedUser: alice._id, displayName: "Parent Alpha", followUpAt: new Date(Date.now() - 60_000), followUpBy: actor._id, followUpNote: "Return the parent’s call", followUpNotifiedAt: null } });
      await WhatsAppMessage.create({ phoneNumber: "919999999991", direction: "inbound", text: "Thanks", receivedAt: new Date() }); await syncWhatsAppConversations();
      const conversation: any = await WhatsAppConversation.findOne({ phoneNumber: "919999999991" }).lean();
      assert.equal(String(conversation.assignedTo), String(actor._id)); assert.equal(String(conversation.linkedUser), String(alice._id)); assert.equal(conversation.displayName, "Parent Alpha");
      await processWhatsAppFollowUps(); await processWhatsAppFollowUps();
      assert.equal(await Notification.countDocuments({ user: actor._id, type: "whatsapp_follow_up" }), 1, "A due reminder must notify once across repeated sweeps");
      const beforeNote = calls.length;
      await WhatsAppPrivateNote.create({ author: actor._id, phoneNumber: "919999999991", body: "Internal handover", requestId: "isolated-note-123456" });
      await WhatsAppSavedReply.create({ createdBy: actor._id, title: "Support", category: "Support", body: "Hello {name}, please share your PGN." });
      assert.equal(calls.length, beforeNote, "Private notes and saved replies must never send customer messages");
      console.log("PASS: real MongoDB template review/approval gating, exact language, personalised/deduplicated broadcasts, concurrent workers, delivery tracking, confirmed-failure retries, unknown-outcome exclusion, opt-outs, preserved assignments/LMS links, internal notes and idempotent follow-up notifications. All Meta traffic simulated.");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
