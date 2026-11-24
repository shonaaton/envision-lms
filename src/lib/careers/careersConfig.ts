import { z } from "zod";
import { exactPhoneNumberProblem } from "@/lib/phoneCountryCodes";

/**
 * Careers: job openings on the public /careers page and the applications made
 * to them. Pure data and validation - no database, no filesystem - so the
 * public form, the admin editor and the API all check against the same rules.
 *
 * Named Job* / careers on purpose: "Opening" in this codebase is a chess opening.
 */

export const JOB_DEPARTMENTS = [
  { value: "coaching", label: "Coaching" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations & Admin" },
  { value: "other", label: "Other" },
] as const;
export type JobDepartment = (typeof JOB_DEPARTMENTS)[number]["value"];

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "consultancy_full_time", label: "Full-time consultancy" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Internship" },
] as const;

export const WORK_MODES = [
  { value: "remote", label: "Remote / Online" },
  { value: "kolkata", label: "Kolkata (on-site)" },
  { value: "hybrid", label: "Hybrid" },
] as const;

export const JOB_STATUSES = ["draft", "open", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const QUESTION_TYPES = [
  { value: "text", label: "Short answer" },
  { value: "longtext", label: "Paragraph" },
  { value: "yesno", label: "Yes / No" },
  { value: "choice", label: "Single choice" },
  { value: "multichoice", label: "Multiple choice" },
  { value: "number", label: "Number" },
  { value: "rating", label: "Rating 1-5" },
  { value: "link", label: "Web link" },
  { value: "consent", label: "Confirmation (must tick)" },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];
const QUESTION_TYPE_VALUES = QUESTION_TYPES.map((item) => item.value) as [QuestionType, ...QuestionType[]];
export const CHOICE_TYPES: QuestionType[] = ["choice", "multichoice"];

export const FIELD_MODES = ["off", "optional", "required"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

/**
 * The standard details every opening can ask for. Name and WhatsApp number
 * are always asked: the WhatsApp code is what submits an application.
 */
export const BASIC_FIELDS = [
  { key: "email", label: "Email address", input: "email", defaultMode: "required" },
  { key: "city", label: "City", input: "text", defaultMode: "required" },
  { key: "age", label: "Age", input: "number", defaultMode: "optional" },
  { key: "currentRole", label: "Current role / occupation", input: "text", defaultMode: "optional" },
  { key: "experienceYears", label: "Years of relevant experience", input: "number", defaultMode: "optional" },
  { key: "languages", label: "Languages you speak", input: "text", defaultMode: "optional" },
  { key: "profileLink", label: "LinkedIn or portfolio link", input: "link", defaultMode: "off" },
  { key: "fideId", label: "FIDE ID", input: "text", defaultMode: "off" },
  { key: "chessRating", label: "Chess rating (FIDE / online)", input: "text", defaultMode: "off" },
] as const;
export type BasicFieldKey = (typeof BASIC_FIELDS)[number]["key"];
export type BasicFieldModes = Record<BasicFieldKey, FieldMode>;

export function defaultBasicFields(department?: string): BasicFieldModes {
  const modes = Object.fromEntries(BASIC_FIELDS.map((field) => [field.key, field.defaultMode])) as BasicFieldModes;
  if (department === "coaching") {
    modes.fideId = "optional";
    modes.chessRating = "required";
  }
  return modes;
}

export const APPLICATION_STAGES = [
  { value: "new", label: "New", tone: "sky" },
  { value: "shortlisted", label: "Shortlisted", tone: "violet" },
  { value: "interview", label: "Interview", tone: "amber" },
  { value: "offered", label: "Offered", tone: "teal" },
  { value: "hired", label: "Hired", tone: "emerald" },
  { value: "rejected", label: "Rejected", tone: "rose" },
  { value: "withdrawn", label: "Withdrawn", tone: "slate" },
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number]["value"];
export const APPLICATION_STAGE_VALUES = APPLICATION_STAGES.map((item) => item.value) as [ApplicationStage, ...ApplicationStage[]];
/** An application in one of these still blocks a second one from the same number for the same opening. */
export const LIVE_STAGES: ApplicationStage[] = ["new", "shortlisted", "interview", "offered"];

/** What clicking Hire creates. Sub-admin accounts (optionally with a named role) need a Super Admin. */
export const HIRE_ACCOUNT_ROLES = [
  { value: "instructor", label: "Coach account" },
  { value: "sub-admin", label: "Staff account (sub-admin / named role)" },
  { value: "none", label: "No portal account" },
] as const;
export type HireAccountRole = (typeof HIRE_ACCOUNT_ROLES)[number]["value"];

export const RESUME_MODES = FIELD_MODES;
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.doc,.docx";

export function labelOf(list: readonly { value: string; label: string }[], value: unknown) {
  return list.find((item) => item.value === value)?.label || String(value || "");
}

export function stageLabel(stage: unknown) {
  return labelOf(APPLICATION_STAGES, stage);
}

export function slugify(text: string) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "opening";
}

// ---------------------------------------------------------------------------
// The opening, as the admin editor saves it
// ---------------------------------------------------------------------------

export const jobQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    text: z.string().trim().min(3, "Write the question.").max(300),
    help: z.string().trim().max(300).default(""),
    type: z.enum(QUESTION_TYPE_VALUES),
    options: z.array(z.string().trim().min(1).max(120)).max(15).default([]),
    required: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (CHOICE_TYPES.includes(value.type) && value.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: `"${value.text}" needs at least two options.` });
    }
  })
  .transform((value) => ({ ...value, options: CHOICE_TYPES.includes(value.type) ? value.options : [] }));
export type JobQuestion = z.infer<typeof jobQuestionSchema>;

const fieldModeSchema = z.enum(FIELD_MODES);

export const jobPostingSchema = z
  .object({
    title: z.string().trim().min(3, "Give the opening a title.").max(120),
    slug: z.string().trim().max(80).optional(),
    department: z.enum(JOB_DEPARTMENTS.map((item) => item.value) as [JobDepartment, ...JobDepartment[]]),
    employmentType: z.enum(EMPLOYMENT_TYPES.map((item) => item.value) as [string, ...string[]]),
    workMode: z.enum(WORK_MODES.map((item) => item.value) as [string, ...string[]]),
    location: z.string().trim().max(120).default(""),
    summary: z.string().trim().min(10, "Add a one or two line summary.").max(400),
    description: z.string().trim().max(8000).default(""),
    payNote: z.string().trim().max(200).default(""),
    status: z.enum(JOB_STATUSES).default("draft"),
    closesAt: z.preprocess((value) => (value ? value : null), z.coerce.date().nullable()).default(null),
    order: z.coerce.number().int().min(0).max(10000).default(100),
    basicFields: z
      .object(Object.fromEntries(BASIC_FIELDS.map((field) => [field.key, fieldModeSchema.default(field.defaultMode)])) as Record<BasicFieldKey, z.ZodDefault<typeof fieldModeSchema>>)
      .default({}),
    resume: z.enum(RESUME_MODES).default("optional"),
    questions: z.array(jobQuestionSchema).max(40, "Keep it to 40 questions or fewer.").default([]),
    hireRole: z.enum(HIRE_ACCOUNT_ROLES.map((item) => item.value) as [HireAccountRole, ...HireAccountRole[]]).default("instructor"),
    hireAccessRole: z.preprocess((value) => (value ? value : null), z.string().regex(/^[a-f\d]{24}$/i).nullable()).default(null),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.questions.forEach((question, index) => {
      if (ids.has(question.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "id"], message: "Two questions share an id." });
      ids.add(question.id);
    });
    if (value.hireAccessRole && value.hireRole !== "sub-admin") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hireAccessRole"], message: "A named role is only for staff accounts." });
    }
  });
export type JobPostingInput = z.infer<typeof jobPostingSchema>;

/**
 * The sales consultant questionnaire (user, 2026-11-24): the role terms as a
 * must-tick confirmation, then situational questions on the academy, AI, price
 * objections, long packages and not getting blocked by parents, then pay.
 */
const SALES_CONSULTANT_QUESTIONS: Omit<JobQuestion, "id">[] = [
  {
    text: "I understand this is a full-time consultancy role, not an employment: a fixed monthly retainer plus sales incentives, with dedicated working time slots. There is no PF and no ESI. I accept these terms.",
    help: "You must tick this to apply.",
    type: "consent", options: [], required: true, active: true,
  },
  {
    text: "Which daily working slot can you commit to?",
    help: "Most parents answer calls in the evening.",
    type: "choice", options: ["10 AM - 7 PM", "12 PM - 9 PM", "2 PM - 10 PM", "Other (mention in the last answer)"], required: true, active: true,
  },
  {
    text: "Look at our website. In your own words, what does Envision Chess Academy offer, and why would a parent choose us over free YouTube videos or a cheaper local coach?",
    help: "We want to see that you did your homework - not a copied paragraph.",
    type: "longtext", options: [], required: true, active: true,
  },
  {
    text: "A parent says: “Another academy charges ₹1,000 a month. Your fee starts at ₹3,000 a month. Why should I pay three times more?” Write exactly what you would reply.",
    help: "", type: "longtext", options: [], required: true, active: true,
  },
  {
    text: "How would you get a parent to choose a 3 or 6-month package instead of paying month by month, without pushing so hard that they stop replying?",
    help: "", type: "longtext", options: [], required: true, active: true,
  },
  {
    text: "Parents often stop answering, or block the number, after a few follow-ups. How do you follow up so you stay welcome and do not get blocked?",
    help: "Think about timing, how often, and what you send.",
    type: "longtext", options: [], required: true, active: true,
  },
  {
    text: "How often do you use AI tools like ChatGPT or Gemini in your work?",
    help: "", type: "choice", options: ["Every day", "A few times a week", "Rarely", "Never used them"], required: true, active: true,
  },
  {
    text: "Give one way you would use AI to sell better here, and one thing you would never let AI do when dealing with parents.",
    help: "", type: "longtext", options: [], required: true, active: true,
  },
  {
    text: "Expected fixed monthly retainer (₹)",
    help: "The fixed part only.", type: "number", options: [], required: true, active: true,
  },
  {
    text: "Expected incentive: how much, and how would you like it worked out?",
    help: "For example ₹X per enrolment, or a % of fees collected above a target.",
    type: "text", options: [], required: true, active: true,
  },
  {
    text: "How soon can you join?",
    help: "", type: "choice", options: ["Immediately", "Within 15 days", "Within 30 days", "More than 30 days"], required: true, active: true,
  },
];

/** A starting question set the editor can load in one click. */
export const QUESTION_TEMPLATES: Record<string, { label: string; questions: Omit<JobQuestion, "id">[] }> = {
  coaching: {
    label: "Chess coach",
    questions: [
      { text: "How many years have you been coaching chess?", help: "", type: "choice", options: ["Less than 1", "1-3", "3-5", "5+"], required: true, active: true },
      { text: "Which levels can you teach?", help: "", type: "multichoice", options: ["Absolute beginners", "Beginners", "Intermediate", "Advanced", "Tournament players"], required: true, active: true },
      { text: "Which age groups have you taught?", help: "", type: "multichoice", options: ["4-6", "7-10", "11-14", "15+", "Adults"], required: false, active: true },
      { text: "Have you taught online classes before?", help: "", type: "yesno", options: [], required: true, active: true },
      { text: "How many hours a week can you teach, and at what times (IST)?", help: "", type: "text", options: [], required: true, active: true },
      { text: "Tell us about a student you helped improve.", help: "", type: "longtext", options: [], required: false, active: true },
      { text: "Link to your Lichess / Chess.com profile", help: "", type: "link", options: [], required: false, active: true },
    ],
  },
  sales: {
    label: "Sales / counsellor",
    questions: [
      { text: "How many years of sales or counselling experience do you have?", help: "", type: "choice", options: ["None", "Less than 1", "1-3", "3+"], required: true, active: true },
      { text: "Have you worked in education / EdTech sales before?", help: "", type: "yesno", options: [], required: true, active: true },
      { text: "Which languages can you call families in?", help: "", type: "multichoice", options: ["English", "Hindi", "Bengali", "Other"], required: true, active: true },
      { text: "Are you comfortable with calling targets and evening shifts?", help: "", type: "yesno", options: [], required: true, active: true },
      { text: "Expected monthly salary (INR)", help: "", type: "number", options: [], required: false, active: true },
      { text: "How soon can you join?", help: "", type: "choice", options: ["Immediately", "Within 15 days", "Within 30 days", "More than 30 days"], required: true, active: true },
    ],
  },
  sales_consultant: {
    label: "Sales consultant (full)",
    questions: SALES_CONSULTANT_QUESTIONS,
  },
  general: {
    label: "General",
    questions: [
      { text: "Why do you want to join Envision Chess Academy?", help: "", type: "longtext", options: [], required: true, active: true },
      { text: "How soon can you join?", help: "", type: "choice", options: ["Immediately", "Within 15 days", "Within 30 days", "More than 30 days"], required: true, active: true },
      { text: "Expected monthly pay (INR)", help: "", type: "number", options: [], required: false, active: true },
    ],
  },
};

export function newQuestionId() {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Whole openings the "New opening" page can start from: details, basic fields
 * and questions filled in, saved as a draft for the admin to check and publish.
 */
export const OPENING_PRESETS: Record<string, { label: string; posting: Omit<JobPostingInput, "questions" | "basicFields"> & { basicFields: BasicFieldModes; questions: Omit<JobQuestion, "id">[] } }> = {
  sales_consultant: {
    label: "Sales Consultant (full-time consultancy)",
    posting: {
      title: "Sales Consultant",
      slug: "sales-consultant",
      department: "sales",
      employmentType: "consultancy_full_time",
      workMode: "remote",
      location: "",
      summary: "Talk to parents who booked a free demo, understand what their child needs and help them enrol. Full-time consultancy with a fixed retainer plus incentives.",
      description: [
        "About the role:",
        "You are the first real conversation a family has with Envision Chess Academy. You call and message parents who asked for a free demo class, help them book it, follow up after the demo and guide them to the right course and package.",
        "",
        "What you will do:",
        "- Call and WhatsApp parents from our demo leads",
        "- Book demo classes and follow up after them",
        "- Explain our courses, fees and monthly and multi-month packages",
        "- Keep every conversation updated in our CRM",
        "- Hit monthly enrolment targets",
        "",
        "What we are looking for:",
        "- Clear, warm spoken English plus Hindi or Bengali",
        "- Comfort with calling targets and evening calls",
        "- Someone who listens first and never pressures a parent",
        "- Experience in education or EdTech sales is a plus",
        "",
        "Terms:",
        "- Full-time consultancy (not employment): fixed monthly retainer + sales incentives",
        "- Dedicated daily working time slots",
        "- No PF or ESI",
        "- Work from home",
      ].join("\n"),
      payNote: "Fixed retainer + incentives",
      status: "draft",
      closesAt: null,
      order: 100,
      basicFields: {
        email: "required",
        city: "required",
        age: "optional",
        currentRole: "required",
        experienceYears: "required",
        languages: "required",
        profileLink: "optional",
        fideId: "off",
        chessRating: "off",
      },
      resume: "optional",
      questions: SALES_CONSULTANT_QUESTIONS,
      hireRole: "sub-admin",
      hireAccessRole: null,
    },
  },
};

// ---------------------------------------------------------------------------
// The application, checked against the opening it was made to
// ---------------------------------------------------------------------------

export type PostingForForm = {
  basicFields: Partial<BasicFieldModes>;
  resume: FieldMode;
  questions: JobQuestion[];
};

export type StoredAnswer = { questionId: string; question: string; type: QuestionType; answer: string | string[] | number | boolean | null };

function cleanUrl(value: string) {
  let text = value.trim();
  if (!text) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type ApplicationValidation =
  | { ok: true; basics: Record<string, string | number>; answers: StoredAnswer[] }
  | { ok: false; field: string; error: string };

const NAME_MAX = 80;

/**
 * Checks one submitted application against the opening's settings and turns
 * the answers into stored copies (question text kept, so editing the opening
 * later never rewrites what someone was asked).
 *
 * `raw.answers` is keyed by question id. Inactive questions are ignored.
 */
export function validateApplication(posting: PostingForForm, raw: Record<string, unknown>): ApplicationValidation {
  const text = (value: unknown, max = 300) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  const name = text(raw.name, NAME_MAX);
  if (name.length < 2) return { ok: false, field: "name", error: "Please enter your full name." };
  const countryCode = text(raw.countryCode, 8) || "+91";
  const phoneProblem = exactPhoneNumberProblem(raw.phone, countryCode);
  if (phoneProblem) return { ok: false, field: "phone", error: phoneProblem };

  const basics: Record<string, string | number> = { name, countryCode, phone: text(raw.phone, 40) };
  const modes = { ...defaultBasicFields(), ...posting.basicFields } as BasicFieldModes;
  for (const field of BASIC_FIELDS) {
    const mode = modes[field.key];
    if (mode === "off") continue;
    const value = text(raw[field.key], 200);
    if (!value) {
      if (mode === "required") return { ok: false, field: field.key, error: `Please fill in: ${field.label}.` };
      continue;
    }
    if (field.input === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, field: field.key, error: "Please enter a valid email address." };
      basics[field.key] = value.toLowerCase();
    } else if (field.input === "number") {
      const number = Number(value);
      const max = field.key === "age" ? 100 : 80;
      if (!Number.isFinite(number) || number < 0 || number > max) return { ok: false, field: field.key, error: `Please enter a valid number for ${field.label}.` };
      if (field.key === "age" && number < 14) return { ok: false, field: field.key, error: "Applicants must be at least 14 years old." };
      basics[field.key] = number;
    } else if (field.input === "link") {
      const url = cleanUrl(value);
      if (!url) return { ok: false, field: field.key, error: `${field.label} is not a valid web address.` };
      basics[field.key] = url;
    } else {
      basics[field.key] = value;
    }
  }

  const given = (raw.answers && typeof raw.answers === "object" ? raw.answers : {}) as Record<string, unknown>;
  const answers: StoredAnswer[] = [];
  for (const question of posting.questions.filter((item) => item.active !== false)) {
    const value = given[question.id];
    const field = `q:${question.id}`;
    const missing = () => ({ ok: false as const, field, error: `Please answer: ${question.text}` });
    let answer: StoredAnswer["answer"] = null;
    switch (question.type) {
      case "text":
      case "longtext": {
        const clean = text(value, question.type === "text" ? 500 : 4000);
        if (clean) answer = clean;
        break;
      }
      case "link": {
        const clean = text(value, 500);
        if (clean) {
          const url = cleanUrl(clean);
          if (!url) return { ok: false, field, error: `The answer to "${question.text}" is not a valid web address.` };
          answer = url;
        }
        break;
      }
      case "yesno": {
        if (value === true || value === "yes") answer = true;
        else if (value === false || value === "no") answer = false;
        break;
      }
      case "consent": {
        // Always required: the applicant has to tick it to apply at all.
        if (value !== true && value !== "yes") return { ok: false, field, error: `Please confirm: ${question.text}` };
        answer = true;
        break;
      }
      case "number": {
        const clean = text(value, 30);
        if (clean) {
          const number = Number(clean.replace(/,/g, ""));
          if (!Number.isFinite(number)) return { ok: false, field, error: `The answer to "${question.text}" must be a number.` };
          answer = number;
        }
        break;
      }
      case "rating": {
        const number = Number(value);
        if (value !== undefined && value !== null && value !== "") {
          if (!Number.isInteger(number) || number < 1 || number > 5) return { ok: false, field, error: `Pick 1 to 5 for "${question.text}".` };
          answer = number;
        }
        break;
      }
      case "choice": {
        const clean = text(value, 200);
        if (clean) {
          if (!question.options.includes(clean)) return { ok: false, field, error: `Pick one of the options for "${question.text}".` };
          answer = clean;
        }
        break;
      }
      case "multichoice": {
        const list = (Array.isArray(value) ? value : value ? [value] : []).map((item) => text(item, 200)).filter(Boolean);
        const unique = [...new Set(list)];
        if (unique.some((item) => !question.options.includes(item))) return { ok: false, field, error: `Pick from the options for "${question.text}".` };
        if (unique.length) answer = unique;
        break;
      }
    }
    if (answer === null) {
      if (question.required) return missing();
      continue;
    }
    answers.push({ questionId: question.id, question: question.text, type: question.type, answer });
  }
  return { ok: true, basics, answers };
}

/** How a stored answer reads in the admin view, the export and emails. */
export function answerText(answer: StoredAnswer["answer"]) {
  if (answer === true) return "Yes";
  if (answer === false) return "No";
  if (Array.isArray(answer)) return answer.join(", ");
  if (answer === null || answer === undefined) return "";
  return String(answer);
}

/** Open, and not past its closing date. */
export function isPostingAcceptingApplications(posting: { status?: string; closesAt?: Date | string | null }, now = new Date()) {
  if (posting.status !== "open") return false;
  if (posting.closesAt && new Date(posting.closesAt).getTime() < now.getTime()) return false;
  return true;
}
