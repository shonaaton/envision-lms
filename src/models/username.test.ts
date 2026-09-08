import { afterEach, describe, expect, it, vi } from "vitest";
import { User, createUserWithUsername, generateUsername } from "@/models/User";

/** Stand-in for the users collection: whatever `exists` is asked about is matched case-insensitively. */
function withUsernames(taken: string[]) {
  const held = new Set(taken.map((value) => value.toLowerCase()));
  vi.spyOn(User, "exists").mockImplementation(((filter: any) => {
    const pattern = filter.username as RegExp;
    const match = [...held].find((value) => pattern.test(value));
    return Promise.resolve(match ? { _id: match } : null);
  }) as any);
  return held;
}

function duplicateKeyError() {
  return Object.assign(new Error("E11000 duplicate key error"), {
    code: 11000,
    keyPattern: { username: 1 },
    keyValue: { username: "Rahul@ENV" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("generateUsername", () => {
  it("leaves an existing account's user ID alone and numbers the newcomer", async () => {
    withUsernames(["Rahul@ENV"]);
    expect(await generateUsername("Rahul Sharma")).toBe("Rahul2@ENV");
  });

  it("keeps counting past every number already handed out", async () => {
    withUsernames(["Rahul@ENV", "Rahul2@ENV", "Rahul3@ENV"]);
    expect(await generateUsername("Rahul")).toBe("Rahul4@ENV");
  });

  it("treats a differently cased ID as taken, since sign-in ignores case", async () => {
    withUsernames(["rahul@env"]);
    expect(await generateUsername("RAHUL")).toBe("RAHUL2@ENV");
  });

  it("falls back to a readable base when the name has no latin letters", async () => {
    withUsernames([]);
    expect(await generateUsername("রাহুল")).toBe("User@ENV");
  });
});

describe("createUserWithUsername", () => {
  it("retries with the next number when the unique index rejects a raced insert", async () => {
    const held = withUsernames(["Rahul@ENV"]);
    const create = vi
      .spyOn(User, "create")
      .mockImplementationOnce(async () => {
        // Another sign-up won the race for Rahul2@ENV between the check and the insert.
        held.add("rahul2@env");
        throw duplicateKeyError();
      })
      .mockImplementationOnce(async (doc: any) => doc);

    const created: any = await createUserWithUsername({ name: "Rahul Sharma", email: "rahul@example.com" });

    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[0][0] as any).username).toBe("Rahul2@ENV");
    expect(created.username).toBe("Rahul3@ENV");
  });

  it("does not swallow unrelated failures", async () => {
    withUsernames([]);
    vi.spyOn(User, "create").mockRejectedValue(
      Object.assign(new Error("E11000 duplicate key error"), { code: 11000, keyPattern: { email: 1 } })
    );
    await expect(createUserWithUsername({ name: "Rahul" })).rejects.toThrow("E11000");
  });
});
