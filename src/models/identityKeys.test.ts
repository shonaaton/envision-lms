import { describe, expect, it } from "vitest";
import { User } from "@/models/User";

/**
 * The match keys are only worth anything if they cannot go stale, so these
 * exercise the hooks rather than the helper they call: a document is built and
 * a query is prepared without ever touching a database, and the keys are read
 * back off them.
 */

function newUser(doc: Record<string, unknown>) {
  const user: any = new User({ name: "Test", passwordHash: "x", ...doc });
  // `validate` is what runs the pre-save chain in isolation; `save()` would need
  // a live connection.
  return user;
}

async function runSaveHooks(user: any) {
  await new Promise<void>((resolve, reject) => {
    user.constructor.hooks.execPre("save", user, [], (error: any) => (error ? reject(error) : resolve()));
  });
  return user;
}

describe("User identity key hooks", () => {
  it("keys a new signup on the inbox and the dialable number", async () => {
    const user = await runSaveHooks(newUser({ email: "Dimple.Luniya+chess@googlemail.com", phone: "09884417455", countryCode: "+91" }));
    expect(user.emailCanonical).toBe("dimpleluniya@gmail.com");
    expect(user.phoneCanonical).toBe("919884417455");
  });

  it("re-keys when the contact details change, so an edit cannot orphan the key", async () => {
    const user = await runSaveHooks(newUser({ email: "first@gmail.com", phone: "9884417455", countryCode: "+91" }));
    user.phone = "9630679840";
    await runSaveHooks(user);
    expect(user.phoneCanonical).toBe("919630679840");
  });

  // Both halves of the number are sent together by the edit forms, which is why
  // the hook can key the update without reading the account back.
  it("re-keys an admin edit that never builds a document", async () => {
    const query: any = User.findOneAndUpdate({ _id: "64b7f9c2e1a4c81234567890" }, { $set: { phone: "9630679840", countryCode: "+91" } });
    await new Promise<void>((resolve, reject) => {
      (User as any).hooks.execPre("findOneAndUpdate", query, [], (error: any) => (error ? reject(error) : resolve()));
    });
    expect(query.getUpdate().$set.phoneCanonical).toBe("919630679840");
  });

  it("leaves an update that touches neither field alone", async () => {
    const query: any = User.findOneAndUpdate({ _id: "64b7f9c2e1a4c81234567890" }, { $set: { name: "Renamed" } });
    await new Promise<void>((resolve, reject) => {
      (User as any).hooks.execPre("findOneAndUpdate", query, [], (error: any) => (error ? reject(error) : resolve()));
    });
    expect(query.getUpdate().$set).not.toHaveProperty("phoneCanonical");
    expect(query.getUpdate().$set).not.toHaveProperty("emailCanonical");
  });
});
