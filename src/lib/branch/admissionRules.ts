/**
 * Pure rules for the branch admission form a family fills in from a link: the
 * fields it takes and the two files it accepts. No filesystem or database, so
 * the form and the API share these limits and admissionRules.test.ts covers them.
 */
import { matchesSignature } from "@/lib/askCoachAttachmentRules";

/** Each file must be under this; the centre asked for "something like 500 KB". */
export const ADMISSION_MAX_FILE_BYTES = 500 * 1024;
/** A link stops working this long after it was sent. */
export const ADMISSION_LINK_DAYS = 14;

export type AdmissionFileKind = "photo" | "idDocument";

type FileType = { extension: string; mimeType: string; signature: "jpeg" | "png" | "webp" | "pdf" };

const JPEG: FileType = { extension: ".jpg", mimeType: "image/jpeg", signature: "jpeg" };
const PNG: FileType = { extension: ".png", mimeType: "image/png", signature: "png" };
const WEBP: FileType = { extension: ".webp", mimeType: "image/webp", signature: "webp" };
const PDF: FileType = { extension: ".pdf", mimeType: "application/pdf", signature: "pdf" };

/** Judged from the file's first bytes, never from its name or the browser's type. */
const ALLOWED: Record<AdmissionFileKind, FileType[]> = {
  photo: [JPEG, PNG, WEBP],
  idDocument: [JPEG, PNG, PDF],
};

export const ADMISSION_ACCEPT: Record<AdmissionFileKind, string> = {
  photo: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  idDocument: "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf",
};

export const ADMISSION_FILE_LABEL: Record<AdmissionFileKind, string> = {
  photo: "student's photo",
  idDocument: "identity document",
};

export function formatKb(bytes: number) {
  return `${Math.ceil(bytes / 1024)} KB`;
}

/** What the file really is, or why it is refused. */
export function checkAdmissionFile(kind: AdmissionFileKind, bytes: Uint8Array): { type: FileType } | { error: string } {
  const label = ADMISSION_FILE_LABEL[kind];
  if (!bytes.length) return { error: `Choose the ${label}.` };
  if (bytes.length > ADMISSION_MAX_FILE_BYTES) {
    return { error: `The ${label} is ${formatKb(bytes.length)}. It must be under ${formatKb(ADMISSION_MAX_FILE_BYTES)}.` };
  }
  const type = ALLOWED[kind].find((candidate) => matchesSignature(candidate.signature, bytes));
  if (!type) return { error: kind === "photo" ? "The photo must be a JPG, PNG or WEBP image." : "The identity document must be a JPG, PNG or PDF." };
  return { type };
}

export type AdmissionFormInput = Record<string, unknown>;

export type AdmissionForm = {
  name: string;
  dateOfBirth: string;
  school: string;
  parentName: string;
  fatherName: string;
  motherName: string;
  phone: string;
  email: string;
  address: string;
};

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** An Indian mobile number as ten digits, from "+91 98765 43210" and the like. */
export function tenDigitPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

/** The family's answers, tidied, or the first thing that needs fixing. */
export function readAdmissionForm(input: AdmissionFormInput, today: Date = new Date()): { form: AdmissionForm } | { error: string } {
  const form: AdmissionForm = {
    name: clean(input.name, 120),
    dateOfBirth: clean(input.dateOfBirth, 10),
    school: clean(input.school, 200),
    parentName: clean(input.parentName, 120),
    fatherName: clean(input.fatherName, 120),
    motherName: clean(input.motherName, 120),
    phone: tenDigitPhone(input.phone),
    email: clean(input.email, 200).toLowerCase(),
    address: String(input.address ?? "").trim().slice(0, 500),
  };
  if (!form.name) return { error: "Enter the student's name." };
  if (form.dateOfBirth) {
    const date = new Date(`${form.dateOfBirth}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || Number.isNaN(date.getTime())) return { error: "Enter a valid date of birth." };
    const age = (today.getTime() - date.getTime()) / (365.25 * 86400000);
    if (age < 2 || age > 100) return { error: "Check the date of birth." };
  }
  if (!form.fatherName && !form.motherName && !form.parentName) return { error: "Enter at least one parent's name." };
  if (!form.phone) return { error: "Enter a 10-digit mobile number." };
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return { error: "Enter a valid email address." };
  if (!form.address) return { error: "Enter your address." };
  return { form };
}

/** A wa.me link that opens the parent's chat with the message ready to send. */
export function whatsAppChatLink(phone: string, message: string) {
  const digits = tenDigitPhone(phone);
  return digits ? `https://wa.me/91${digits}?text=${encodeURIComponent(message)}` : "";
}

export function admissionMessage(input: { parentName?: string; studentName: string; link: string; branchLabel: string }) {
  const greeting = input.parentName ? `Hello ${input.parentName},` : "Hello,";
  return [
    greeting,
    "",
    `Thank you for choosing Envision Chess Academy's ${input.branchLabel} centre for ${input.studentName}.`,
    `Please fill in the admission form here: ${input.link}`,
    "",
    `You will need a photo of ${input.studentName} and an identity document (each under ${formatKb(ADMISSION_MAX_FILE_BYTES)}). The link works for ${ADMISSION_LINK_DAYS} days.`,
  ].join("\n");
}
