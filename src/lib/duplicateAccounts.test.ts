import { afterEach, describe, expect, it, vi } from "vitest";
import { findDuplicateCandidates } from "@/lib/duplicateAccounts";
import { User } from "@/models/User";

/**
 * Stand-in for the users collection. Only the `$or` on the canonical keys is
 * honoured, because that is the query under test - the `_id: { $ne }` clause is
 * applied too, so an account cannot be reported as a duplicate of itself.
 */
function withUsers(rows: any[]) {
  vi.spyOn(User, "find").mockImplementation(((filter: any) => {
    const clauses: any[] = filter.$or || [];
    const excluded = String(filter._id?.$ne || "");
    const matched = rows.filter((row) => {
      if (excluded && String(row._id) === excluded) return false;
      return clauses.some((clause) =>
        Object.entries(clause).every(([key, value]: [string, any]) =>
          value && typeof value === "object" && "$in" in value
            ? value.$in.includes((row as any)[key] ?? null)
            : (row as any)[key] === value
        )
      );
    });
    const chain: any = {
      select: () => chain,
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve(matched),
    };
    return chain;
  }) as any);
}

const sankesh = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaa1",
  name: "Sankesh Roonwal",
  email: "dimple.luniya@gmail.com",
  username: "Sankesh@ENV",
  phone: "9884417455",
  countryCode: "+91",
  accountStatus: "demo",
  emailCanonical: "dimpleluniya@gmail.com",
  phoneCanonical: "919884417455",
};

afterEach(() => vi.restoreAllMocks());

describe("findDuplicateCandidates", () => {
  it("catches the Gmail respelling the unique index let through", async () => {
    withUsers([sankesh]);
    const matches = await findDuplicateCandidates({ email: "dimpleluniya@gmail.com", phone: "9884417455", countryCode: "+91" });
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toEqual(["email", "phone"]);
    expect(matches[0].username).toBe("Sankesh@ENV");
  });

  it("catches a shared phone on its own - the sibling case an admin has to rule on", async () => {
    withUsers([sankesh]);
    const matches = await findDuplicateCandidates({ email: "another.parent@outlook.com", phone: "09884417455", countryCode: "91" });
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toEqual(["phone"]);
  });

  it("does not report an account against itself on an edit", async () => {
    withUsers([sankesh]);
    const matches = await findDuplicateCandidates({
      userId: "aaaaaaaaaaaaaaaaaaaaaaa1",
      email: sankesh.email,
      phone: sankesh.phone,
      countryCode: sankesh.countryCode,
    });
    expect(matches).toEqual([]);
  });

  it("leaves unrelated families alone", async () => {
    withUsers([sankesh]);
    expect(await findDuplicateCandidates({ email: "trisha@gmail.com", phone: "9474200456", countryCode: "+91" })).toEqual([]);
  });

  it("still finds an account that predates the match keys, by its raw phone", async () => {
    const { emailCanonical, phoneCanonical, ...legacy } = sankesh;
    withUsers([legacy]);
    const matches = await findDuplicateCandidates({ email: "second.child@outlook.com", phone: "9884417455", countryCode: "+91" });
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toEqual(["phone"]);
  });

  it("never matches on blank details, which every account without a phone would share", async () => {
    const withoutContact = { ...sankesh, phone: "", countryCode: "", phoneCanonical: "" };
    withUsers([withoutContact]);
    expect(await findDuplicateCandidates({ email: "", phone: "", countryCode: "" })).toEqual([]);
    const matches = await findDuplicateCandidates({ email: "dimpleluniya@gmail.com", phone: "", countryCode: "" });
    expect(matches[0].reasons).toEqual(["email"]);
  });
});
