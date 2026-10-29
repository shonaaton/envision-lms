/**
 * A refusal the branch screens show as it is. Kept in its own file so code the
 * scheduled jobs reach (settings, reminders, reports) can use it without
 * pulling in lib/branch/service.ts, which loads Node's crypto - see
 * lib/tempPasswords.ts for why instrumentation must not.
 */
export class BranchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
