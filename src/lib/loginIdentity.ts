/**
 * Login identifier matching.
 *
 * Students can sign in with their email or the generated user ID
 * (`Rahul@ENV`). Emails are stored lowercased so they compare cleanly, but user
 * IDs keep their original casing, which made ID login case-sensitive: a parent
 * typing `rahul@env`, or a phone keyboard changing the capital, got
 * "Invalid email, user ID, or password" with the correct credentials.
 */
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(value: string) {
  return value.replace(REGEX_METACHARACTERS, "\\$&");
}

/**
 * Mongo filter matching a login value against email or username.
 *
 * The username clause is an anchored, case-insensitive exact match. The input is
 * escaped first so a value like `.*` cannot turn this into a wildcard that
 * matches an arbitrary account.
 */
export function loginIdentifierFilter(loginValue: string) {
  const trimmed = String(loginValue || "").trim();
  const compact = loginKey(trimmed);
  const or: Array<Record<string, unknown>> = [{ email: compact }];
  if (trimmed) {
    or.push({ username: new RegExp(`^${escapeRegex(trimmed)}$`, "i") });
    if (compact !== trimmed.toLowerCase()) {
      or.push({ username: new RegExp(`^${escapeRegex(compact)}$`, "i") });
    }
  }
  return { $or: or };
}

/**
 * The login value as it is stored: lowercased, with every space removed. No
 * email or generated user ID contains whitespace, but phone keyboards add one
 * after "@" or before ".com" (`name@ gmail.com`), and that was refused as an
 * unknown account. Also the rate-limit key, so spacing variants share a budget.
 */
export function loginKey(loginValue: string) {
  return String(loginValue || "").replace(/\s+/g, "").toLowerCase();
}
