import { auth } from "@/lib/auth";

/**
 * One way to authenticate a scheduled job.
 *
 * The reminder endpoints each grew their own secret and header convention:
 * `ASK_COACH_REMINDER_SECRET` and `HOMEWORK_REMINDER_SECRET` over `x-cron-secret`,
 * `CRON_SECRET` over `Authorization: Bearer`, `DEMO_REMINDER_SECRET` over either.
 * A caller had to know which job it was invoking to know how to authenticate.
 *
 * `CRON_SECRET` now works on every one of them, over either header. The legacy
 * per-job secrets still work so existing cron entries keep running through a
 * deploy, but each use logs a deprecation warning naming the job — clear those
 * out of the crontab and then drop the variables.
 */

/** Legacy per-job secrets, kept working until the crontab is migrated. */
const LEGACY_SECRETS: Record<string, string[]> = {
  ask_coach_email_reminders: ["ASK_COACH_REMINDER_SECRET"],
  ask_coach_whatsapp_reminders: ["ASK_COACH_REMINDER_SECRET"],
  homework_email_reminders: ["HOMEWORK_REMINDER_SECRET", "ASK_COACH_REMINDER_SECRET"],
  demo_reminders: ["DEMO_REMINDER_SECRET"],
  monthly_invoice_reminders: [],
  class_session_reminders: [],
};

export type CronJobName = keyof typeof LEGACY_SECRETS;

function providedSecret(req: Request) {
  const header = req.headers.get("x-cron-secret");
  if (header) return header.trim();
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer ? bearer.trim() : "";
}

/**
 * Constant-time-ish comparison. Secrets here are compared as whole strings and
 * a mismatch is not attacker-observable through timing in any practical way,
 * but length-first short-circuiting is avoided regardless.
 */
function secretsMatch(provided: string, expected: string) {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export type CronAuthResult = {
  ok: boolean;
  /** How the caller authenticated, for logging. */
  via: "cron_secret" | "legacy_secret" | "session" | "none";
  legacyVariable?: string;
};

/**
 * Authorizes a scheduled-job request by shared secret, falling back to an
 * interactive admin session so the endpoints stay manually runnable from the
 * portal. `allowRoles` defaults to admin only; pass a wider set where a
 * sub-admin is meant to be able to trigger the job by hand.
 */
export async function authorizeCronRequest(
  req: Request,
  job: CronJobName,
  allowRoles: string[] = ["admin"],
): Promise<CronAuthResult> {
  const provided = providedSecret(req);

  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && secretsMatch(provided, cronSecret)) return { ok: true, via: "cron_secret" };

  for (const variable of LEGACY_SECRETS[job] || []) {
    const legacy = String(process.env[variable] || "").trim();
    if (legacy && secretsMatch(provided, legacy)) {
      console.warn(
        `[cron] "${job}" authenticated with the deprecated ${variable}. ` +
          "Switch this cron entry to CRON_SECRET; the legacy variable will be removed.",
      );
      return { ok: true, via: "legacy_secret", legacyVariable: variable };
    }
  }

  const session = await auth();
  const role = String((session?.user as any)?.role || "");
  if (role && allowRoles.includes(role)) return { ok: true, via: "session" };

  return { ok: false, via: "none" };
}
