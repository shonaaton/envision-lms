/**
 * Set by /api/auth/resume when it signs out a session whose account no longer
 * exists; read and cleared by the login page, which says why it is showing.
 * Not httpOnly on purpose: it carries no data, only "show the notice".
 */
export const SESSION_ENDED_COOKIE = "envision-session-ended";
