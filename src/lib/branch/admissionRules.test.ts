import { describe, expect, it } from "vitest";
import {
  ADMISSION_MAX_FILE_BYTES,
  admissionMessage,
  checkAdmissionFile,
  readAdmissionForm,
  tenDigitPhone,
  whatsAppChatLink,
} from "@/lib/branch/admissionRules";

const bytes = (head: number[], size = 1024) => {
  const data = new Uint8Array(size);
  data.set(head);
  return data;
};
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const EXE = [0x4d, 0x5a, 0x90, 0x00];

describe("checkAdmissionFile", () => {
  it("accepts photos and documents by their content", () => {
    expect(checkAdmissionFile("photo", bytes(JPEG))).toMatchObject({ type: { extension: ".jpg" } });
    expect(checkAdmissionFile("photo", bytes(WEBP))).toMatchObject({ type: { extension: ".webp" } });
    expect(checkAdmissionFile("idDocument", bytes(PDF))).toMatchObject({ type: { mimeType: "application/pdf" } });
    expect(checkAdmissionFile("idDocument", bytes(PNG))).toMatchObject({ type: { extension: ".png" } });
  });

  it("refuses a PDF as the photo and a renamed program as either", () => {
    expect(checkAdmissionFile("photo", bytes(PDF))).toEqual({ error: "The photo must be a JPG, PNG or WEBP image." });
    expect("error" in checkAdmissionFile("idDocument", bytes(EXE))).toBe(true);
    expect("error" in checkAdmissionFile("photo", bytes(EXE))).toBe(true);
  });

  it("holds the 500 KB line exactly", () => {
    expect("type" in checkAdmissionFile("photo", bytes(JPEG, ADMISSION_MAX_FILE_BYTES))).toBe(true);
    const tooBig = checkAdmissionFile("photo", bytes(JPEG, ADMISSION_MAX_FILE_BYTES + 1));
    expect(tooBig).toEqual({ error: "The student's photo is 501 KB. It must be under 500 KB." });
  });

  it("asks for a missing file", () => {
    expect(checkAdmissionFile("idDocument", new Uint8Array())).toEqual({ error: "Choose the identity document." });
  });
});

describe("readAdmissionForm", () => {
  const good = { name: "  Arko   Sen ", fatherName: "Amit Sen", phone: "+91 98765 43210", address: "12 B B Ganguly St", email: "Amit@Example.com" };

  it("tidies a good form", () => {
    const result = readAdmissionForm(good);
    expect(result).toMatchObject({ form: { name: "Arko Sen", phone: "9876543210", email: "amit@example.com" } });
  });

  it("names the first thing to fix", () => {
    expect(readAdmissionForm({ ...good, name: "" })).toEqual({ error: "Enter the student's name." });
    expect(readAdmissionForm({ ...good, fatherName: "" })).toEqual({ error: "Enter at least one parent's name." });
    expect(readAdmissionForm({ ...good, phone: "12345" })).toEqual({ error: "Enter a 10-digit mobile number." });
    expect(readAdmissionForm({ ...good, email: "amit@" })).toEqual({ error: "Enter a valid email address." });
    expect(readAdmissionForm({ ...good, address: " " })).toEqual({ error: "Enter your address." });
  });

  it("checks the date of birth is a plausible child's or adult's", () => {
    const today = new Date("2026-10-28T00:00:00Z");
    expect("form" in readAdmissionForm({ ...good, dateOfBirth: "2016-05-01" }, today)).toBe(true);
    expect(readAdmissionForm({ ...good, dateOfBirth: "2026-01-01" }, today)).toEqual({ error: "Check the date of birth." });
    expect(readAdmissionForm({ ...good, dateOfBirth: "01/05/2016" }, today)).toEqual({ error: "Enter a valid date of birth." });
  });
});

describe("phone and messages", () => {
  it("reads Indian mobiles in the usual shapes", () => {
    expect(tenDigitPhone("098765 43210")).toBe("9876543210");
    expect(tenDigitPhone("919876543210")).toBe("9876543210");
    expect(tenDigitPhone("033 2241 0000")).toBe("");
  });

  it("builds a ready-to-send WhatsApp chat", () => {
    const message = admissionMessage({ parentName: "Mrs Sen", studentName: "Arko", link: "https://x.test/admission/t", branchLabel: "Bowbazar" });
    expect(message).toContain("https://x.test/admission/t");
    expect(message).toContain("under 500 KB");
    expect(whatsAppChatLink("98765 43210", message)).toMatch(/^https:\/\/wa\.me\/919876543210\?text=Hello%20Mrs%20Sen/);
    expect(whatsAppChatLink("", message)).toBe("");
  });
});
