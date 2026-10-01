/* API/data checks against scripts/ptm-local-dev.cjs only; never production. */
const { MongoClient, ObjectId } = require("mongodb");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve("../../outputs/ptm-verification");
const fixture = JSON.parse(fs.readFileSync(path.join(output, "fixtures.json"), "utf8"));
assert(fixture.database === "ptm_disposable" && /^mongodb:\/\/127\.0\.0\.1:/.test(fixture.uri));
const base = "http://localhost:3012";
const clients = new Map();
async function login(key) {
  if (clients.has(key)) return clients.get(key);
  const cookies = new Map();
  const request = async (url, options = {}) => {
    const response = await fetch(base + url, { ...options, redirect: "manual", headers: { ...options.headers, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    return response;
  };
  const csrf = await (await request("/api/auth/csrf")).json();
  const response = await request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: `ptm-${key}`, password: "PtmLocalTest-2026!", callbackUrl: base + "/ptm" }) });
  assert.equal(response.status, 200);
  const session = await (await request("/api/auth/session")).json(); assert.equal(session.user?.id, fixture.users[key], `Login ${key}`);
  clients.set(key, request); return request;
}
async function api(key, url, body, method = "PATCH") {
  const response = await (await login(key))(url, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = response.headers.get("Content-Type")?.includes("json") ? await response.json() : null;
  return { status: response.status, data, location: response.headers.get("Location") };
}
async function main() {
  const client = new MongoClient(fixture.uri); await client.connect(); const db = client.db(fixture.database);
  try {
    const mode = process.argv[2] || "inspect";
    const p = await db.collection("ptms").findOne({ student: new ObjectId(fixture.users.student), status: { $nin: ["rejected", "cancelled"] } }, { sort: { createdAt: -1 } });
    if (mode === "inspect") { console.log(JSON.stringify({ ptm: p, tasks: await db.collection("internaltasks").find({ referenceType: /^Ptm/ }).toArray() }, null, 2)); return; }
    assert(p, "Create a request from the student UI first.");
    const id = String(p._id);
    if (mode === "tasks") {
      const approval = await db.collection("internaltasks").findOne({ referenceType: "PtmApproval", referenceId: p._id });
      assert.equal(String(approval.assignedTo), fixture.users.coach); assert.equal(approval.status, "pending");
      const list = await api("coach", "/api/tasks"); assert(JSON.stringify(list.data).includes("Approve PTM"));
      console.log("PASS coach sees request approval task"); return;
    }
    if (mode === "scheduled") {
      assert.equal(p.status, "scheduled");
      for (const key of ["student", "coach"]) {
        const list = await api(key, "/api/ptm"); const view = list.data.ptms.find(row => row._id === id);
        assert(!("meetingUrl" in view)); assert(!("feedback" in view));
        const join = await api(key, `/api/ptm/${id}/join`); assert.equal(join.status, 302); assert(join.location.endsWith("/ptm?join=early"));
      }
      const summary = await api("student", "/api/ptm?summary=1"); assert.equal(summary.data.credits.remaining, 11); assert.equal(summary.data.credits.used, 1);
      const request = await api("student", "/api/ptm", { coach: fixture.users.coach, preferredAt: new Date(Date.now() + 86400_000).toISOString(), reason: "Too soon for another PTM" }, "POST"); assert.equal(request.status, 400); assert(request.data.error.includes("30 days"));
      assert.equal((await api("coach", `/api/ptm/${id}`, { action: "schedule", scheduledAt: new Date(Date.now() + 720000).toISOString(), durationMinutes: 30, meetingUrl: p.meetingUrl })).status, 403);
      assert.equal((await api("otherstudent", `/api/ptm/${id}/join`)).status, 403);
      assert.equal((await api("othercoach", `/api/ptm/${id}/join`)).status, 403);
      for (const ref of ["PtmApproval", "PtmSchedule"]) assert.equal((await db.collection("internaltasks").findOne({ referenceType: ref, referenceId: p._id })).status, "completed");
      const emails = await (await fetch("http://127.0.0.1:3013/emails")).json(); const email = emails.find(e => e.metadata?.kind === "ptm_scheduled"); assert(email); assert(email.message.includes("IST")); assert(email.actionUrl.endsWith("/ptm")); assert(!JSON.stringify(email).includes("meet.google.com"));
      console.log("PASS early Join redirects, 11 credits, 30-day refusal, private data, task resolution, role boundaries, and captured confirmation email"); return;
    }
    if (mode === "join") {
      await db.collection("ptms").updateOne({ _id: p._id }, { $set: { scheduledAt: new Date(Date.now() + 5 * 60_000) } });
      for (const key of ["student", "coach"]) { const r = await api(key, `/api/ptm/${id}/join`); assert.equal(r.status, 302); assert.equal(r.location, p.meetingUrl); }
      console.log("PASS Join redirects to Meet inside T-10 window"); return;
    }
    if (mode === "past") { await db.collection("ptms").updateOne({ _id: p._id }, { $set: { scheduledAt: new Date(Date.now() - 31 * 60_000) } }); console.log("Moved meeting past its end for student feedback UI"); return; }
    if (mode === "feedback") {
      assert.equal(p.feedback.rating, 5); assert.equal(p.feedback.comments, "Clear and helpful guidance for home practice.");
      for (const key of ["student", "coach"]) { const list = await api(key, "/api/ptm"); assert(!("feedback" in list.data.ptms.find(row => row._id === id))); }
      for (const key of ["admin", "subadmin"]) { const list = await api(key, "/api/ptm"); assert.equal(list.data.ptms.find(row => row._id === id).feedback.rating, 5); }
      assert.equal((await api("student", `/api/ptm/${id}`, { action: "feedback", rating: 1, preparedness: 1, clarity: 1, comments: "Duplicate" })).status, 409);
      console.log("PASS feedback visible only to admin/sub-admin and rejected on duplicate submission"); return;
    }
    if (mode === "pool") {
      assert.equal(p.status, "approved"); const task = await db.collection("internaltasks").findOne({ referenceType: "PtmSchedule", referenceId: p._id }); assert.equal(task.pool, "admins"); assert.equal(task.status, "pending");
      const tasks = await api("subadmin", "/api/tasks"); assert(JSON.stringify(tasks.data).includes("Confirm PTM timing")); console.log("PASS sub-admin sees pool scheduling task"); return;
    }
  } finally { await client.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
