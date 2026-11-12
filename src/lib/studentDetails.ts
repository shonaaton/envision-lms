/**
 * The details every online student is asked for once, at their next sign-in,
 * when the record is missing them. Older accounts were created with a single
 * `name` and no age, parent or location, so they all see the form once.
 *
 * Pure: shared by the dashboard layout (who sees the form), the student's save
 * route (what it accepts), and the tests.
 */

export const STUDENT_AGE_MIN = 2;
export const STUDENT_AGE_MAX = 100;
/** At this age and above a parent's name is not required. */
export const ADULT_AGE = 18;
const TEXT_MAX = 80;

export type StudentDetailsSource = {
  role?: string;
  accountStatus?: string;
  branch?: unknown;
  name?: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  parentName?: string;
  parentEmail?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

export type StudentDetailsField = "firstName" | "lastName" | "age" | "parentName" | "country" | "city";

/**
 * Every online student, old or new, enrolled or demo. Offline-branch students
 * gave their details on the paper admission form and are managed by the branch.
 */
export function studentDetailsApply(user: StudentDetailsSource) {
  return user.role === "student" && !user.branch;
}

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function missingStudentDetails(user: StudentDetailsSource): StudentDetailsField[] {
  if (!studentDetailsApply(user)) return [];
  const missing: StudentDetailsField[] = [];
  if (!filled(user.firstName)) missing.push("firstName");
  if (!filled(user.lastName)) missing.push("lastName");
  const hasAge = typeof user.age === "number" && Number.isFinite(user.age);
  if (!hasAge) missing.push("age");
  if (!filled(user.parentName) && (!hasAge || (user.age as number) < ADULT_AGE)) missing.push("parentName");
  if (!filled(user.country)) missing.push("country");
  if (!filled(user.city)) missing.push("city");
  return missing;
}

export function needsStudentDetails(user: StudentDetailsSource) {
  return missingStudentDetails(user).length > 0;
}

/** What the form opens with: saved values first, then a best guess from `name` and the dialling code. */
export function studentDetailsDefaults(user: StudentDetailsSource) {
  const parts = (user.name || "").trim().split(/\s+/).filter(Boolean);
  const hasSplit = filled(user.firstName);
  return {
    firstName: hasSplit ? user.firstName!.trim() : parts[0] || "",
    lastName: hasSplit ? (user.lastName || "").trim() : parts.slice(1).join(" "),
    age: typeof user.age === "number" ? String(user.age) : "",
    parentName: (user.parentName || "").trim(),
    parentEmail: (user.parentEmail || "").trim(),
    country: (user.country || "").trim() || (user.countryCode?.trim() === "+91" ? "India" : ""),
    city: (user.city || "").trim(),
  };
}

export type StudentDetailsInput = Record<string, unknown>;
export type StudentDetailsUpdate = {
  firstName: string;
  lastName: string;
  name: string;
  age: number;
  parentName?: string;
  parentEmail?: string;
  country: string;
  city: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the form a student sent. Returns the fields to save, or the first problem. */
export function parseStudentDetails(input: StudentDetailsInput): { ok: true; update: StudentDetailsUpdate } | { ok: false; error: string } {
  const text = (key: string) => String(input[key] ?? "").trim().replace(/\s+/g, " ");
  const firstName = text("firstName");
  const lastName = text("lastName");
  const parentName = text("parentName");
  const parentEmail = text("parentEmail").toLowerCase();
  const country = text("country");
  const city = text("city");
  const ageRaw = text("age");
  const age = Number(ageRaw);

  if (!firstName) return { ok: false, error: "Please enter the student's first name." };
  if (!lastName) return { ok: false, error: "Please enter the student's last name." };
  if (!ageRaw || !Number.isInteger(age) || age < STUDENT_AGE_MIN || age > STUDENT_AGE_MAX) {
    return { ok: false, error: `Please enter the student's age in years (${STUDENT_AGE_MIN}-${STUDENT_AGE_MAX}).` };
  }
  if (age < ADULT_AGE && !parentName) return { ok: false, error: "Please enter a parent's or guardian's name." };
  if (parentEmail && !EMAIL_RE.test(parentEmail)) return { ok: false, error: "Please check the parent's email address." };
  if (!country) return { ok: false, error: "Please enter your country." };
  if (!city) return { ok: false, error: "Please enter your city." };
  for (const [label, value] of [["First name", firstName], ["Last name", lastName], ["Parent's name", parentName], ["Country", country], ["City", city]] as const) {
    if (value.length > TEXT_MAX) return { ok: false, error: `${label} must be ${TEXT_MAX} characters or fewer.` };
  }
  if (parentEmail.length > 120) return { ok: false, error: "Parent's email is too long." };

  return {
    ok: true,
    update: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      age,
      ...(parentName ? { parentName } : {}),
      ...(parentEmail ? { parentEmail } : {}),
      country,
      city,
    },
  };
}
