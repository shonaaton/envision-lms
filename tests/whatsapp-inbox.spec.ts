import { test as base, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config";
import { WHATSAPP_STARTER_REPLIES } from "../src/lib/whatsappSavedReplies";

// Exercise the real components in an isolated browser. All provider/API traffic
// is simulated; this suite cannot send WhatsApp messages or touch the LMS DB.
let javascript = "";
let stylesheet = "";
const root = path.resolve(__dirname, "..");
const origin = "http://localhost:4179";
type Message = { id: string; phoneNumber: string; direction: string; text: string; messageType: string; status: string; createdAt: string };
type Portal = { page: Page; store: any; replies: any[]; templates: any[]; refresh: () => Promise<void> };

const test = base.extend<{ portal: Portal }>({
  portal: async ({ page }, use) => {
    const now = Date.now();
    const phoneA = "919999999991", phoneB = "919999999992";
    const store: any = {
      contacts: [
        { phoneNumber: phoneA, contactName: "Parent Alpha", activeUntil: new Date(now + 3600_000).toISOString(), lastInboundId: "a-79", unreadCount: 1, needsReply: true, resolved: false, sentTemplateCount: 1 },
        { phoneNumber: phoneB, contactName: "Coach Beta", activeUntil: new Date(now + 3600_000).toISOString(), unreadCount: 0, needsReply: false, resolved: false, sentTemplateCount: 0 },
      ],
      messages: {
        [phoneA]: Array.from({ length: 80 }, (_, i) => ({ id: `a-${i}`, phoneNumber: phoneA, direction: i % 2 ? "inbound" : "outbound", text: i === 3 ? "Historical needle 2025" : `Alpha message ${i}: class schedule and homework`, messageType: "text", status: i % 2 ? "received" : "sent", createdAt: new Date(now - (80 - i) * 60_000).toISOString() })),
        [phoneB]: [{ id: "b-1", phoneNumber: phoneB, direction: "inbound", text: "Beta conversation", messageType: "text", status: "received", createdAt: new Date(now - 1000).toISOString() }],
      },
      replyMode: "success", replyDelay: 0, threadDelayA: 0, templateDelay: 0, templateMode: "success", threadFailure: false,
      library: [{ id: "100000000000000000000001", name: "approved_class_update", language: "en_US", category: "UTILITY", body: "Hello {{1}}, your class starts at 6 PM.", header: "Class update", footer: "Team Envision", variables: [{ position: 1, key: "Student name", sample: "Aarav" }], buttons: [], status: "APPROVED", metaId: "meta-1", sendable: true, contentVersion: "a".repeat(64), revision: 1, lastSyncedAt: new Date().toISOString() }],
      connectionReady: true, librarySaves: [], submissions: [], chatTemplates: [], uploads: [], savedReplies: [], privateNotes: [], notes: { [phoneA]: [], [phoneB]: [] },
      contexts: {
        [phoneA]: { profile: { id: "200000000000000000000001", name: "Aarav Alpha", role: "student", username: "aarav", parentName: "Parent Alpha", parentEmail: "alpha@example.test" }, batches: [{ id: "batch-a", name: "Beginner Level 1", coachName: "Coach Beta" }], fees: { planName: "Chess credits", type: "credits", creditBalance: 4, outstanding: 1500, invoices: [{ number: "ENV-100", totalAmount: 1500, status: "unpaid" }] } },
        [phoneB]: { profile: { id: "200000000000000000000002", name: "Coach Beta", role: "instructor", username: "beta" }, batches: [], fees: null },
      },
      staff: [{ id: "test-admin", name: "Test Admin", role: "admin" }, { id: "coach-beta", name: "Coach Beta", role: "instructor" }],
      campaigns: [], campaignCommands: [],
    };
    const replies: any[] = [], templates: any[] = [], errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/bundle.js") return route.fulfill({ contentType: "text/javascript", body: javascript });
      if (url.pathname === "/styles.css") return route.fulfill({ contentType: "text/css", body: stylesheet });
      if (url.pathname === "/api/admin/whatsapp/templates") return json({ templates: [], source: "local" });
      if (url.pathname === "/api/admin/whatsapp/templates/library") {
        if (request.method() === "POST") {
          const body = request.postDataJSON(); store.librarySaves.push(body);
          const existing = body.id ? store.library.find((item: any) => item.id === body.id) : null;
          if (existing && existing.revision !== body.revision) return json({ error: "This draft changed. Refresh before editing." }, 409);
          const template = { ...body, id: body.id || (100 + store.library.length).toString(16).padStart(24, "0"), status: "DRAFT", sendable: false, contentVersion: "a".repeat(64), revision: existing ? existing.revision + 1 : 1 };
          if (existing) store.library = store.library.map((item: any) => item.id === body.id ? template : item); else store.library.push(template);
          return json({ ok: true, template }, existing ? 200 : 201);
        }
        const templates = store.library.filter((item: any) => url.searchParams.get("approved") !== "1" || item.sendable);
        return json({ ok: true, templates, connectionReady: store.connectionReady, sendingReady: store.connectionReady });
      }
      const submission = url.pathname.match(/^\/api\/admin\/whatsapp\/templates\/library\/([^/]+)\/submit$/);
      if (submission) {
        store.submissions.push({ id: submission[1], ...request.postDataJSON() });
        const template = store.library.find((item: any) => item.id === submission[1]);
        if (template.status !== "DRAFT") return json({ error: "Already submitted" }, 409);
        template.status = "PENDING"; template.metaId = `meta-${store.library.length}`; template.revision++; template.lastSyncedAt = new Date().toISOString();
        return json({ ok: true, template, message: "Submitted to Meta for review." });
      }
      const draftRemoval = url.pathname.match(/^\/api\/admin\/whatsapp\/templates\/library\/([^/]+)$/);
      if (draftRemoval && request.method() === "DELETE") { store.library = store.library.filter((item: any) => item.id !== draftRemoval[1]); return json({ ok: true }); }
      if (url.pathname === "/api/admin/whatsapp/templates/send") {
        const body = request.postDataJSON(); store.chatTemplates.push(body);
        const template = store.library.find((item: any) => item.id === body.templateId);
        if (!template?.sendable) return json({ ok: false, error: "This template is not approved.", retryable: true }, 409);
        const text = template.body.replace(/\{\{(\d+)\}\}/g, (_whole: string, i: string) => body.values[Number(i) - 1]);
        const id = `chat-template-${store.chatTemplates.length}`;
        if (store.messages[body.phoneNumber]) store.messages[body.phoneNumber].push({ id, phoneNumber: body.phoneNumber, direction: "outbound", text, messageType: "template", status: "accepted", createdAt: new Date().toISOString() });
        return json({ ok: true, messageId: id });
      }
      if (url.pathname === "/api/admin/whatsapp/media/send") {
        const form = await new Request(request.url(), { method: "POST", headers: { "Content-Type": request.headers()["content-type"] }, body: request.postDataBuffer() }).formData();
        const file = form.get("file") as File;
        const phone = String(form.get("phoneNumber"));
        store.uploads.push({ phone, filename: file.name, contents: await file.text(), caption: form.get("caption"), requestId: form.get("requestId") });
        const id = `upload-${store.uploads.length}`;
        store.messages[phone].push({ id, phoneNumber: phone, direction: "outbound", text: String(form.get("caption")), messageType: "document", mediaKind: "document", mediaFilename: file.name, mediaUrl: "/fake-attachment", status: "accepted", createdAt: new Date().toISOString() });
        return json({ ok: true, messageId: id });
      }
      if (url.pathname === "/api/admin/whatsapp/saved-replies") {
        if (request.method() === "POST") { const body = request.postDataJSON(); const id = body.id || `reply-${store.savedReplies.length}`; store.savedReplies = [...store.savedReplies.filter((item: any) => item.id !== id), { ...body, id, editable: true }]; return json({ ok: true }); }
        if (request.method() === "DELETE") { store.savedReplies = store.savedReplies.filter((item: any) => item.id !== url.searchParams.get("id")); return json({ ok: true }); }
        return json({ replies: [...WHATSAPP_STARTER_REPLIES.map((reply) => ({ ...reply, editable: false })), ...store.savedReplies] });
      }
      if (url.pathname === "/api/admin/whatsapp/conversation") {
        if (request.method() === "POST") {
          const body = request.postDataJSON(), contact = store.contacts.find((item: any) => item.phoneNumber === body.phoneNumber), context = store.contexts[body.phoneNumber];
          if (body.action === "note") { if (!store.privateNotes.some((note: any) => note.requestId === body.requestId)) { store.privateNotes.push(body); store.notes[body.phoneNumber].unshift({ id: `note-${store.privateNotes.length}`, body: body.text, author: "Test Admin", createdAt: new Date().toISOString() }); } }
          if (body.action === "assign") { const person = store.staff.find((item: any) => item.id === body.userId); contact.assignedTo = person || null; context.assignedTo = person || null; }
          if (body.action === "followUp") { const date = body.followUpAt ? new Date(`${body.followUpAt}+05:30`).toISOString() : null; contact.followUpAt = date; context.followUpAt = date; context.followUpNote = body.note || ""; }
          if (body.action === "link") { context.profile = body.userId ? { id: body.userId, name: "Correct Student", role: "student", username: "correct_student", parentName: "Parent Correct" } : null; context.displayName = body.displayName || ""; contact.contactName = body.displayName || context.profile?.name || "Unknown contact"; }
          return json({ ok: true });
        }
        if (url.searchParams.get("staff") === "1") return json({ staff: store.staff });
        const phone = url.searchParams.get("phone")!;
        if (url.searchParams.has("searchUsers")) return json({ users: [{ id: "200000000000000000000003", name: "Correct Student", role: "student", username: "correct_student", phone: phoneA }] });
        if (url.searchParams.get("notes") === "1") return json({ notes: store.notes[phone] || [], nextCursor: null });
        return json({ ...store.contexts[phone] });
      }
      if (url.pathname === "/api/admin/whatsapp/campaigns") {
        if (request.method() === "POST") {
          const body = request.postDataJSON(); store.campaignCommands.push(body);
          if (body.action === "preview") {
            const template = store.library.find((item: any) => item.id === body.templateId), id = `campaign-${store.campaigns.length + 1}`;
            const numbers = body.recipientGroup === "manual" ? [...new Set(body.recipients)] : [phoneA, phoneB];
            const recipients = numbers.map((number: any, index: number) => { const name = index ? "Coach Beta" : "Parent Alpha", values = body.variableInputs.map((value: string) => value.replace(/\{name\}/g, name)); return { id: `recipient-${index}`, phoneNumber: number, name, values, preview: template.body.replace(/\{\{(\d+)\}\}/g, (_whole: string, i: string) => values[Number(i) - 1]), state: "pending", attempt: 0 }; });
            const campaign = { id, name: body.name, templateSnapshot: template, templateId: template.id, status: "draft", revision: 1, recipientCount: recipients.length, recipients, createdAt: new Date().toISOString() }; store.campaigns.unshift(campaign);
            return json({ ok: true, campaignId: id, revision: 1, recipientCount: recipients.length, recipients, excluded: [], template });
          }
          const campaign = store.campaigns.find((item: any) => item.id === body.campaignId);
          if (body.action === "start") { campaign.status = "scheduled"; campaign.scheduledAt = body.scheduledAt ? new Date(`${body.scheduledAt}+05:30`).toISOString() : new Date().toISOString(); campaign.revision++; }
          if (body.action === "cancel") { campaign.status = "cancelled"; campaign.recipients.forEach((item: any) => { if (item.state === "pending") item.state = "cancelled"; }); }
          if (body.action === "retry_failed") { campaign.recipients.forEach((item: any) => { if (item.state === "failed") { item.state = "pending"; item.attempt++; } }); campaign.status = "scheduled"; campaign.revision++; }
          return json({ ok: true, message: "Broadcast updated.", retryCount: 1 });
        }
        if (url.searchParams.get("batches") === "1") return json({ batches: [{ id: "batch-a", name: "Beginner Level 1" }] });
        if (url.searchParams.has("id")) {
          const campaign = store.campaigns.find((item: any) => item.id === url.searchParams.get("id")); const counts = campaign.recipients.reduce((all: any, item: any) => ({ ...all, [item.state]: (all[item.state] || 0) + 1 }), {});
          return json({ campaign, recipients: campaign.recipients, counts, page: Number(url.searchParams.get("page") || 1) });
        }
        return json({ campaigns: store.campaigns, nextCursor: null });
      }
      if (url.pathname === "/api/admin/whatsapp/reply") {
        const body = request.postDataJSON(); replies.push(body);
        if (store.replyDelay) await new Promise((resolve) => setTimeout(resolve, store.replyDelay));
        if (store.replyMode === "offline") return route.abort("failed");
        if (store.replyMode === "failure") return json({ ok: false, error: "Recipient unavailable", retryable: true });
        const id = `sent-${replies.length}`;
        store.messages[body.phoneNumber].push({ id, phoneNumber: body.phoneNumber, direction: "outbound", text: body.text, messageType: "text", status: "accepted", createdAt: new Date().toISOString() });
        return json({ ok: true, messageId: id });
      }
      if (url.pathname === "/api/admin/whatsapp/template") {
        const body = request.postDataJSON(); templates.push(body);
        if (store.templateDelay) await new Promise((resolve) => setTimeout(resolve, store.templateDelay));
        if (store.templateMode === "offline") return route.abort("failed");
        return json({ ok: true, results: [{ ok: true, phoneNumber: body.recipients[0], status: "queued" }] });
      }
      if (url.pathname === "/api/admin/whatsapp") {
        if (request.method() === "PATCH") {
          const body = request.postDataJSON(), contact = store.contacts.find((item: any) => item.phoneNumber === body.phoneNumber);
          if (body.action === "read") contact.unreadCount = 0;
          else { contact.resolved = body.action === "resolve"; contact.needsReply = !contact.resolved; }
          return json({ ok: true });
        }
        if (url.searchParams.get("view") === "thread") {
          if (store.threadFailure) return json({ error: "Conversation temporarily unavailable" }, 502);
          const phone = url.searchParams.get("phone")!;
          const query = url.searchParams.get("q")?.toLowerCase() || "";
          let messages: Message[] = [...(store.messages[phone] || [])];
          if (query) messages = messages.filter((message) => message.text.toLowerCase().includes(query));
          const before = Number(url.searchParams.get("before") || messages.length);
          const rows = messages.slice(Math.max(0, before - 50), before);
          const response = { messages: rows, hasMore: before > 50, nextCursor: before > 50 ? String(before - 50) : null };
          if (phone === phoneA && store.threadDelayA) await new Promise((resolve) => setTimeout(resolve, store.threadDelayA));
          return json(response);
        }
        return json({ conversations: store.contacts.map((contact: any) => ({ ...contact, lastMessageText: store.messages[contact.phoneNumber].at(-1)?.text, lastMessageAt: store.messages[contact.phoneNumber].at(-1)?.createdAt })) });
      }
      if (url.origin === origin && url.pathname.startsWith("/admin/whatsapp")) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>@media(max-width:767px){main{padding-top:56px}}</style></head><body><main class="compact-dashboard-ui" style="height:100dvh;overflow-y:auto"><div id="root" style="padding:16px"></div></main><script src="/bundle.js"></script></body></html>' });
      return route.abort();
    });
    await page.goto(`${origin}/admin/whatsapp`);
    expect(errors).toEqual([]);
    await expect(page.getByRole("button", { name: "Open chat with Parent Alpha" })).toBeVisible();
    const refresh = async () => { await page.getByRole("button", { name: "Refresh inbox" }).click(); await expect(page.getByTestId("message-scroll-area")).toContainText("Alpha message"); };
    await use({ page, store, replies, templates, refresh });
    expect(errors).toEqual([]);
  },
});

test.use({ launchOptions: { executablePath: fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined } });
test.beforeAll(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import Workspace from "./src/components/admin/WhatsAppWorkspace"; import LiveDataRefresher from "./src/components/layout/LiveDataRefresher"; createRoot(document.getElementById("root")).render(<><Workspace actorId="test-admin" /><LiveDataRefresher /></>);', resolveDir: root, sourcefile: "test-entry.tsx", loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_ACADEMY_TIME_ZONE": '"Asia/Kolkata"' }, plugins: [{ name: "test-router", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "test-router" }));
    builder.onLoad({ filter: /.*/, namespace: "test-router" }, () => ({ contents: 'const router = {refresh() { window.__testRouterRefreshes = (window.__testRouterRefreshes || 0) + 1; }}; export const useRouter = () => router;', loader: "js" }));
  } }] });
  javascript = result.outputFiles[0].text;
  const sources = ["src/components/admin/WhatsAppWorkspace.tsx", ...fs.readdirSync(path.join(root, "src/components/admin/whatsapp")).filter((file) => file.endsWith(".tsx")).map((file) => `src/components/admin/whatsapp/${file}`)].map((file) => ({ raw: fs.readFileSync(path.join(root, file), "utf8"), extension: "tsx" }));
  stylesheet = (await postcss([tailwindcss({ ...tailwindConfig, content: sources })]).process(fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8"), { from: undefined })).css;
});

test("delivery receipts and incoming messages preserve reading position; sending stays inside the chat", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  const area = page.getByTestId("message-scroll-area");
  await expect(area).toContainText("Alpha message 79");
  await area.evaluate((element) => { element.scrollTop = 180; });
  const before = await area.evaluate((element) => element.scrollTop);
  const pageY = await page.evaluate(() => window.scrollY);
  store.messages["919999999991"][78].status = "read";
  await portal.refresh();
  await expect(page.getByLabel("Message read").last()).toBeVisible();
  expect(Math.abs(await area.evaluate((element) => element.scrollTop) - before)).toBeLessThan(3);
  store.messages["919999999991"].push({ id: "incoming-new", phoneNumber: "919999999991", direction: "inbound", text: "A newly arriving message", messageType: "text", status: "received", createdAt: new Date().toISOString() });
  await portal.refresh();
  await expect(page.getByRole("button", { name: "New messages ↓" })).toBeVisible();
  expect(Math.abs(await area.evaluate((element) => element.scrollTop) - before)).toBeLessThan(3);
  await page.getByRole("button", { name: "New messages ↓" }).click();
  await page.getByRole("textbox", { name: "Message reply" }).fill("My outgoing message");
  await page.getByRole("textbox", { name: "Message reply" }).press("Enter");
  await expect(area).toContainText("My outgoing message");
  await expect(page.getByRole("textbox", { name: "Message reply" })).toBeEmpty();
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  expect(await area.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(80);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).__testRouterRefreshes || 0)).toBe(0);
  await page.screenshot({ path: "test-results/whatsapp-desktop.png" });
});

test("drafts belong to contacts and a send finishing in another chat does not clear the active draft", async ({ portal }) => {
  const { page, store, replies } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  const input = page.getByRole("textbox", { name: "Message reply" });
  await input.fill("Alpha draft");
  await page.getByRole("button", { name: "Open chat with Coach Beta" }).click();
  await expect(input).toBeEmpty(); await input.fill("Beta draft");
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await expect(input).toHaveValue("Alpha draft");
  store.replyDelay = 700;
  await input.press("Enter");
  await page.getByRole("button", { name: "Open chat with Coach Beta" }).click();
  await expect(input).toHaveValue("Beta draft");
  await expect.poll(() => replies.length).toBe(1);
  await page.waitForTimeout(900);
  await expect(input).toHaveValue("Beta draft");
  expect(replies[0].phoneNumber).toBe("919999999991");
  await input.press("Shift+Enter"); await input.pressSequentially("Second line");
  await expect(input).toHaveValue("Beta draft\nSecond line");
  await page.reload(); await page.getByRole("button", { name: "Open chat with Coach Beta" }).click();
  await expect(input).toHaveValue("Beta draft\nSecond line");
});

test("a rejected send preserves the draft and retries, while an interrupted send checks the same request", async ({ portal }) => {
  const { page, store, replies } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  const input = page.getByRole("textbox", { name: "Message reply" });
  store.replyMode = "failure";
  await input.fill("Please send this"); await input.press("Enter");
  await expect(page.getByTestId("message-scroll-area")).toContainText("Recipient unavailable");
  await expect(input).toHaveValue("Please send this");
  store.replyMode = "success";
  await page.getByRole("button", { name: "Retry message", exact: true }).click();
  await expect(input).toBeEmpty();
  expect(replies[0].requestId).not.toBe(replies[1].requestId);
  store.replyMode = "offline";
  await input.fill("Interrupted message"); await input.press("Enter");
  await expect(page.getByRole("button", { name: "Check send result" })).toBeVisible();
  store.replyMode = "success";
  await page.reload();
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await expect(input).toHaveValue("Interrupted message");
  await page.getByRole("button", { name: "Check send result" }).click();
  await expect(input).toBeEmpty();
  expect(replies[2].requestId).toBe(replies[3].requestId);
});

test("older messages preserve the visible anchor and remain available after refresh; search includes older history", async ({ portal }) => {
  const { page } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  const area = page.getByTestId("message-scroll-area");
  await expect(area).toContainText("Alpha message 30");
  await area.evaluate((element) => { element.scrollTop = 0; });
  const anchor = area.locator('[data-message-id="a-30"]');
  const before = (await anchor.boundingBox())!.y;
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(area).toContainText("Historical needle 2025");
  expect(Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(50);
  await portal.refresh(); await expect(area).toContainText("Historical needle 2025");
  await page.getByRole("textbox", { name: "Search this conversation" }).fill("Historical needle");
  await expect(area).toContainText("1 matching messages");
  await expect(area).toContainText("Historical needle 2025");
  await expect(area).not.toContainText("Alpha message 79");
});

test("search, reply filters and resolution are independent from the reply window", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("textbox", { name: "Search contacts" }).fill("9999999992");
  await expect(page.getByRole("button", { name: "Open chat with Coach Beta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat with Parent Alpha" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search contacts" }).clear();
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await page.getByRole("button", { name: "Resolve conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen conversation" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message reply" })).toBeEnabled();
  await page.getByRole("button", { name: /^Resolved \(/ }).click();
  await expect(page.getByRole("button", { name: "Open chat with Parent Alpha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat with Coach Beta" })).toHaveCount(0);
  store.contacts[0].activeUntil = new Date(Date.now() - 1000).toISOString();
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await expect(page.getByRole("textbox", { name: "Message reply" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reopen conversation" })).toBeVisible();
});

test("mobile chat and contact drawer fit a shortened viewport", async ({ portal }) => {
  const { page } = portal;
  await page.setViewportSize({ width: 390, height: 740 });
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await expect(page.getByRole("button", { name: "Back to chats" })).toBeVisible();
  await page.getByRole("button", { name: "Contact details", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Contact details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Contact details" })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 420 });
  const input = page.getByRole("textbox", { name: "Message reply" });
  await expect(input).toBeVisible();
  expect(await input.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
  await expect.poll(async () => { const box = await input.boundingBox(); return box ? box.y + box.height : 9999; }).toBeLessThanOrEqual(420);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/whatsapp-mobile.png" });
});

test("templates start without recipients and double clicks cannot submit twice", async ({ portal }) => {
  const { page, store, templates } = portal;
  await page.getByRole("button", { name: "Template Automation", exact: true }).click();
  await expect(page.getByLabel("Recipients", { exact: true })).toBeEmpty();
  await page.getByRole("button", { name: "Send template", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Choose at least one recipient");
  expect(templates).toHaveLength(0);
  await page.getByLabel("Recipients", { exact: true }).fill("919999999991");
  store.templateDelay = 500;
  await page.getByRole("button", { name: "Send template", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => templates.length).toBe(1);
  await expect(page.getByText("queued", { exact: true })).toBeVisible();
  expect(templates).toHaveLength(1);
});

test("a slow response for a previous contact cannot replace the selected conversation", async ({ portal }) => {
  const { page, store } = portal;
  store.threadDelayA = 600;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await page.getByRole("button", { name: "Open chat with Coach Beta" }).click();
  await expect(page.getByTestId("message-scroll-area")).toContainText("Beta conversation");
  await page.waitForTimeout(850);
  await expect(page.getByTestId("message-scroll-area")).toContainText("Beta conversation");
  await expect(page.getByTestId("message-scroll-area")).not.toContainText("Alpha message");
});

test("an interrupted template send survives reload and can be checked or deliberately reset", async ({ portal }) => {
  const { page, store, templates } = portal;
  await page.getByRole("button", { name: "Template Automation", exact: true }).click();
  await page.getByLabel("Recipients", { exact: true }).fill("919999999991");
  store.templateMode = "offline";
  await page.getByRole("button", { name: "Send template", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check send result", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Template Automation", exact: true }).click();
  await page.getByRole("button", { name: "Check send result", exact: true }).click();
  await expect.poll(() => templates.length).toBe(2);
  expect(templates[0].requestId).toBe(templates[1].requestId);
  expect(templates[1].recipients).toEqual(["919999999991"]);
  await page.getByRole("button", { name: "Start a new send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send template", exact: true })).toBeVisible();
  expect(templates).toHaveLength(2);
});

test("a successful contact refresh does not hide a failed conversation request", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  store.threadFailure = true;
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await expect(page.getByRole("alert")).toContainText("Conversation temporarily unavailable");
  store.threadFailure = false;
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a template moves from draft through Meta review to approved and becomes usable", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByLabel("Template name", { exact: true }).fill("new_class_notice");
  await page.getByRole("combobox", { name: "Template language", exact: true }).selectOption("en_US");
  await page.getByRole("textbox", { name: "Template message body" }).fill("Hello {{1}}, your next class is tomorrow at 6 PM. See you there!");
  await page.getByRole("textbox", { name: "Example for variable 1" }).fill("Aarav");
  await expect(page.getByRole("button", { name: "Submit to Meta", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => store.librarySaves.length).toBe(1);
  await expect(page.getByRole("button", { name: "Submit to Meta", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Submit to Meta", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => store.submissions.length).toBe(1);
  await expect(page.getByText("PENDING", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Use approved template", exact: true })).toHaveCount(0);
  const template = store.library.find((item: any) => item.name === "new_class_notice");
  template.status = "APPROVED"; template.sendable = true;
  await page.getByRole("button", { name: "Refresh Meta status", exact: true }).click();
  await page.getByRole("button", { name: "Use approved template", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send approved template" });
  await dialog.getByRole("textbox", { name: "Template recipient number" }).fill("919999999991");
  await dialog.getByRole("textbox", { name: "Template field 1" }).fill("Aarav");
  await expect(dialog).toContainText("Hello Aarav, your next class is tomorrow at 6 PM.");
  await dialog.getByRole("button", { name: "Send template", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(store.chatTemplates[0]).toMatchObject({ templateId: template.id, phoneNumber: "919999999991", values: ["Aarav"] });
  expect(template.language).toBe("en_US");
  await page.locator("main").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: "test-results/whatsapp-template-manager.png", fullPage: true });
});

test("rejection reasons are visible and revisions create a new draft without changing the rejected version", async ({ portal }) => {
  const { page, store } = portal;
  Object.assign(store.library[0], { status: "REJECTED", sendable: false, rejectionReason: "INCORRECT_CATEGORY" });
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await page.getByRole("button", { name: /^approved_class_update/ }).click();
  await expect(page.getByRole("alert")).toContainText("INCORRECT_CATEGORY");
  await expect(page.getByRole("button", { name: "Use approved template", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy and revise", exact: true }).click();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue("approved_class_update_copy");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => store.library.length).toBe(2);
  expect(store.library[0].status).toBe("REJECTED"); expect(store.submissions).toHaveLength(0);
});

test("refresh updates an approved preview when Meta changes its content", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await page.getByRole("button", { name: /approved_class_update en_US/ }).click();
  store.library[0].body = "Hello {{1}}, your class now starts at 7 PM.";
  store.library[0].contentVersion = "b".repeat(64);
  await page.getByRole("button", { name: "Refresh Meta status", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Template message body" })).toHaveValue(store.library[0].body);
  await page.getByRole("button", { name: "Use approved template", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send approved template" });
  await page.getByRole("textbox", { name: "Template field 1" }).fill("Aarav");
  await expect(dialog).toContainText("Hello Aarav, your class now starts at 7 PM.");
});

test("refresh preserves unsaved draft edits and does not adopt another editor's revision", async ({ portal }) => {
  const { page, store } = portal;
  store.library[0].status = "DRAFT"; store.library[0].sendable = false;
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await page.getByRole("button", { name: /approved_class_update en_US/ }).click();
  const body = page.getByRole("textbox", { name: "Template message body" });
  await body.fill("Hello {{1}}, this is my unsaved local draft.");
  store.library[0].body = "Hello {{1}}, this was saved by another admin."; store.library[0].revision = 2;
  await page.getByRole("button", { name: "Refresh Meta status", exact: true }).click();
  await expect(body).toHaveValue("Hello {{1}}, this is my unsaved local draft.");
  await expect(page.getByRole("status")).toContainText("changed elsewhere");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("This draft changed");
  expect(store.librarySaves[0].revision).toBe(1);
  expect(store.library[0].body).toBe("Hello {{1}}, this was saved by another admin.");
});

test("the template manager, sending preview and broadcast centre fit a mobile screen", async ({ portal }) => {
  const { page } = portal;
  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await page.getByRole("button", { name: /approved_class_update en_US/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Use approved template", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send approved template" });
  await expect(dialog).toBeVisible();
  await page.getByRole("textbox", { name: "Template field 1" }).fill("Aarav");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.getByRole("textbox", { name: "Template field 1" }).evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Broadcast centre", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview recipients and messages", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("draft authoring works without a Meta connection while submission stays disabled", async ({ portal }) => {
  const { page, store } = portal; store.connectionReady = false;
  await page.getByRole("button", { name: "Message templates", exact: true }).click();
  await expect(page.getByText(/Meta connection is unavailable/)).toBeVisible();
  await page.getByLabel("Template name", { exact: true }).fill("offline_draft");
  await page.getByRole("textbox", { name: "Template message body" }).fill("Your class schedule has been updated. Please check the LMS.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => store.librarySaves.length).toBe(1);
  await expect(page.getByRole("button", { name: "Submit to Meta", exact: true })).toBeDisabled();
});

test("approved templates can be previewed inside an expired chat and revoked approval blocks sending", async ({ portal }) => {
  const { page, store } = portal;
  store.contacts[0].activeUntil = new Date(Date.now() - 1000).toISOString();
  await page.getByRole("button", { name: "Refresh inbox" }).click();
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await expect(page.getByRole("textbox", { name: "Message reply" })).toBeDisabled();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send approved template" });
  await dialog.getByRole("combobox", { name: "Approved chat template" }).selectOption(store.library[0].id);
  await dialog.getByRole("textbox", { name: "Template field 1" }).fill("Aarav");
  await expect(dialog).toContainText("Hello Aarav, your class starts at 6 PM.");
  store.library[0].sendable = false; store.library[0].status = "PAUSED";
  await dialog.getByRole("button", { name: "Send template", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("not approved");
  await expect(dialog.getByRole("textbox", { name: "Template field 1" })).toHaveValue("Aarav");
  expect(portal.replies).toHaveLength(0);
});

test("saved replies can be created and inserted with contact personalisation without sending", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await page.getByRole("button", { name: "Saved replies", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Saved replies" });
  await dialog.getByRole("textbox", { name: "Saved reply title" }).fill("Chess support");
  await dialog.getByRole("textbox", { name: "Saved reply text" }).fill("Hello {name}, please share the PGN file for review.");
  await dialog.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect.poll(() => store.savedReplies.length).toBe(1);
  await dialog.getByRole("textbox", { name: "Search saved replies" }).fill("Chess support");
  await dialog.getByRole("button", { name: "Insert into draft", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message reply" })).toHaveValue("Hello Parent Alpha, please share the PGN file for review.");
  expect(portal.replies).toHaveLength(0);
});

test("a PGN attachment is sent to the selected contact and appears in the conversation", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await page.getByRole("button", { name: "Attach file", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send attachment" });
  await dialog.getByLabel("Choose WhatsApp attachment", { exact: true }).setInputFiles({ name: "Lesson.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from('[Event "Homework"]\n\n1. e4 e5 *') });
  await dialog.getByRole("textbox", { name: "Attachment caption" }).fill("Today’s homework");
  await dialog.getByRole("button", { name: "Send attachment", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(store.uploads[0]).toMatchObject({ phone: "919999999991", filename: "Lesson.pgn", caption: "Today’s homework" });
  await expect(page.getByTestId("message-scroll-area").getByRole("link", { name: "Lesson.pgn" })).toBeVisible();
});

test("assignment, private handover notes, follow-ups and corrected LMS links stay inside the workspace", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Open chat with Parent Alpha" }).click();
  await expect(page.getByText("Beginner Level 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Outstanding:", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "Conversation assignee" }).selectOption("coach-beta");
  await expect.poll(() => store.contacts[0].assignedTo?.name).toBe("Coach Beta");
  await page.getByRole("textbox", { name: "Private conversation note" }).fill("Parent prefers an evening callback. Internal handover only.");
  await page.getByRole("button", { name: "Add private note", exact: true }).click();
  await expect(page.getByText("Parent prefers an evening callback. Internal handover only.", { exact: true })).toBeVisible();
  expect(store.privateNotes).toHaveLength(1); expect(portal.replies).toHaveLength(0);
  await page.getByRole("button", { name: "Tomorrow, 10 AM", exact: true }).click();
  await expect.poll(() => store.contacts[0].followUpAt).toBeTruthy();
  await page.getByRole("button", { name: /^Follow-ups \(/ }).click();
  await expect(page.getByRole("button", { name: "Open chat with Parent Alpha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat with Coach Beta" })).toHaveCount(0);
  await page.getByText("Correct contact link", { exact: true }).click();
  await page.getByRole("textbox", { name: "Find LMS contact" }).fill("Correct");
  await page.getByRole("button", { name: /^Correct Student/ }).click();
  await expect(page.getByRole("button", { name: "Open chat with Correct Student" })).toBeVisible();
});

test("broadcast preview freezes personalised messages, schedules in IST, and retries confirmed failures only", async ({ portal }) => {
  const { page, store } = portal;
  await page.getByRole("button", { name: "Broadcast centre", exact: true }).click();
  await page.getByRole("textbox", { name: "Broadcast name", exact: true }).fill("Class update broadcast");
  await page.getByRole("combobox", { name: "Broadcast template" }).selectOption(store.library[0].id);
  await page.getByRole("combobox", { name: "Broadcast audience" }).selectOption("students");
  await page.getByRole("textbox", { name: "Broadcast field 1" }).fill("{name}");
  await page.getByRole("button", { name: "Preview recipients and messages", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Hello Parent Alpha, your class starts at 6 PM." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hello Coach Beta, your class starts at 6 PM." })).toBeVisible();
  expect(store.campaigns[0].status).toBe("draft");
  await page.getByRole("textbox", { name: "Broadcast name", exact: true }).fill("Changed after preview");
  await expect(page.getByRole("button", { name: "Send broadcast now", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Broadcast name", exact: true }).fill("Class update broadcast");
  await page.getByLabel("Broadcast schedule time", { exact: true }).fill("2027-01-10T18:00");
  await page.getByRole("button", { name: "Schedule broadcast", exact: true }).click();
  await expect.poll(() => store.campaigns[0].status).toBe("scheduled");
  expect(store.campaignCommands.at(-1)).toMatchObject({ action: "start", scheduledAt: "2027-01-10T18:00" });
  expect(store.campaigns[0].scheduledAt).toBe("2027-01-10T12:30:00.000Z");
  store.campaigns[0].status = "completed"; store.campaigns[0].recipients[0].state = "failed"; store.campaigns[0].recipients[1].state = "unconfirmed";
  await page.getByRole("button", { name: "Refresh progress", exact: true }).click();
  await page.getByRole("button", { name: "Retry confirmed failures only", exact: true }).click();
  await expect.poll(() => store.campaigns[0].recipients[0].state).toBe("pending");
  expect(store.campaigns[0].recipients[1].state).toBe("unconfirmed"); expect(portal.replies).toHaveLength(0);
  await page.locator("main").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: "test-results/whatsapp-broadcast-centre.png", fullPage: true });
});

test("overdue follow-ups and an approaching reply-window expiry are highlighted", async ({ portal }) => {
  const { page, store } = portal;
  store.contacts[0].activeUntil = new Date(Date.now() + 3600_000).toISOString();
  store.contacts[1].activeUntil = new Date(Date.now() + 24 * 3600_000).toISOString();
  store.contacts[0].followUpAt = new Date(Date.now() - 60_000).toISOString();
  await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
  const contact = page.getByRole("button", { name: "Open chat with Parent Alpha", exact: true });
  await expect(contact).toContainText("Reply window expiring soon");
  await expect(contact).toContainText("Follow-up overdue");
  await page.getByRole("button", { name: /^Expiring soon \(1\)$/ }).click();
  await expect(contact).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat with Coach Beta", exact: true })).toHaveCount(0);
});
