import { describe, expect, it } from "vitest";
import { OPENING_PRESETS, answerText, isPostingAcceptingApplications, jobPostingSchema, slugify, validateApplication, type JobQuestion } from "@/lib/careers/careersConfig";

const questions: JobQuestion[] = [
  { id: "years", text: "Years coaching?", help: "", type: "choice", options: ["0-1", "1-3", "3+"], required: true, active: true },
  { id: "levels", text: "Levels you teach", help: "", type: "multichoice", options: ["Beginner", "Advanced"], required: false, active: true },
  { id: "online", text: "Taught online?", help: "", type: "yesno", options: [], required: true, active: true },
  { id: "hidden", text: "Old question", help: "", type: "text", options: [], required: true, active: false },
  { id: "salary", text: "Expected pay", help: "", type: "number", options: [], required: false, active: true },
];
const posting = { basicFields: { email: "required", city: "optional", age: "off" } as any, resume: "optional" as const, questions };
const good = { name: "Priya Sen", countryCode: "+91", phone: "9123456789", email: "Priya@Example.com", answers: { years: "1-3", online: "yes", levels: ["Beginner"], salary: "25,000" } };

describe("validateApplication", () => {
  it("accepts a complete application and keeps the question text with each answer", () => {
    const result = validateApplication(posting, good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.basics.email).toBe("priya@example.com");
    expect(result.answers.map((a) => a.questionId)).toEqual(["years", "levels", "online", "salary"]);
    expect(result.answers.find((a) => a.questionId === "online")?.answer).toBe(true);
    expect(result.answers.find((a) => a.questionId === "salary")?.answer).toBe(25000);
    expect(result.answers[0].question).toBe("Years coaching?");
  });

  it("requires required questions but ignores hidden ones", () => {
    const result = validateApplication(posting, { ...good, answers: { years: "1-3" } });
    expect(result).toMatchObject({ ok: false, field: "q:online" });
  });

  it("refuses an option that is not on the list", () => {
    expect(validateApplication(posting, { ...good, answers: { ...good.answers, years: "10+" } })).toMatchObject({ ok: false, field: "q:years" });
    expect(validateApplication(posting, { ...good, answers: { ...good.answers, levels: ["Grandmaster"] } })).toMatchObject({ ok: false, field: "q:levels" });
  });

  it("needs a real WhatsApp number for the dialling code", () => {
    expect(validateApplication(posting, { ...good, phone: "91234" })).toMatchObject({ ok: false, field: "phone" });
  });

  it("honours required / off basic fields", () => {
    expect(validateApplication(posting, { ...good, email: "" })).toMatchObject({ ok: false, field: "email" });
    const result = validateApplication(posting, { ...good, age: "30" });
    expect(result.ok && "age" in result.basics).toBe(false);
  });
});

describe("jobPostingSchema", () => {
  const base = { title: "Online Chess Coach", department: "coaching", employmentType: "part_time", workMode: "remote", summary: "Teach kids chess online, evenings IST." };

  it("fills defaults", () => {
    const parsed = jobPostingSchema.parse(base);
    expect(parsed.status).toBe("draft");
    expect(parsed.resume).toBe("optional");
    expect(parsed.basicFields.email).toBe("required");
  });

  it("needs two options on a choice question", () => {
    expect(() => jobPostingSchema.parse({ ...base, questions: [{ id: "a", text: "Pick one", type: "choice", options: ["Only"] }] })).toThrow();
  });

  it("drops options from non-choice questions", () => {
    const parsed = jobPostingSchema.parse({ ...base, questions: [{ id: "a", text: "Tell us more", type: "longtext", options: ["x", "y"] }] });
    expect(parsed.questions[0].options).toEqual([]);
  });

  it("only allows a named role on a staff account", () => {
    expect(() => jobPostingSchema.parse({ ...base, hireRole: "instructor", hireAccessRole: "5f1d7f2e4b3a2c1d0e9f8a7b" })).toThrow();
  });
});

describe("helpers", () => {
  it("slugifies titles", () => expect(slugify("Sales Counsellor (Kolkata)!")).toBe("sales-counsellor-kolkata"));
  it("reads answers", () => {
    expect(answerText(true)).toBe("Yes");
    expect(answerText(["A", "B"])).toBe("A, B");
  });
  it("stops taking applications after the closing date", () => {
    expect(isPostingAcceptingApplications({ status: "open", closesAt: new Date("2020-01-01") })).toBe(false);
    expect(isPostingAcceptingApplications({ status: "open", closesAt: null })).toBe(true);
    expect(isPostingAcceptingApplications({ status: "draft" })).toBe(false);
  });
});

describe("consent questions and presets", () => {
  it("refuses an application until the confirmation is ticked, whatever its required flag says", () => {
    const consent: JobQuestion = { id: "terms", text: "No PF or ESI - I accept", help: "", type: "consent", options: [], required: false, active: true };
    const withConsent = { ...posting, questions: [consent] };
    expect(validateApplication(withConsent, { ...good, answers: {} })).toMatchObject({ ok: false, field: "q:terms" });
    expect(validateApplication(withConsent, { ...good, answers: { terms: false } })).toMatchObject({ ok: false, field: "q:terms" });
    const result = validateApplication(withConsent, { ...good, answers: { terms: true } });
    expect(result.ok && result.answers[0].answer).toBe(true);
  });

  it("the sales consultant preset is a valid opening with the role terms first", () => {
    const preset = OPENING_PRESETS.sales_consultant.posting;
    const parsed = jobPostingSchema.parse({ ...preset, questions: preset.questions.map((question, index) => ({ ...question, id: `q${index}` })) });
    expect(parsed.employmentType).toBe("consultancy_full_time");
    expect(parsed.questions[0].type).toBe("consent");
    expect(parsed.questions[0].text).toMatch(/PF/);
    expect(parsed.questions.some((question) => /1,000/.test(question.text))).toBe(true);
  });
});
