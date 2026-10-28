import { describe, expect, it } from "vitest";
import { renderTemplateBody, templateComponents, templateSendSupport, validateTemplateDraft } from "./whatsappTemplateRules";
const draft = { name: "class_update", language: "en_US", category: "UTILITY", header: "Class update", body: "Hello {{1}}, your class starts at {{2}}. See you there!", footer: "Team Envision", variables: [{ position: 1, key: "Student name", sample: "Aarav" }, { position: 2, key: "Class time", sample: "6 PM IST" }], buttons: [{ type: "URL", text: "Open LMS", url: "https://envisionchessacademy.com/dashboard" }] };
describe("template authoring rules", () => {
  it("preserves exact language codes and builds Meta's positional examples", () => {
    const result = validateTemplateDraft(draft); expect(result.error).toBeUndefined(); expect(result.draft?.language).toBe("en_US");
    expect(templateComponents(result.draft!)).toEqual(expect.arrayContaining([{ type: "BODY", text: draft.body, example: { body_text: [["Aarav", "6 PM IST"]] } }, { type: "HEADER", format: "TEXT", text: "Class update" }]));
  });
  it.each([
    [{ name: "Class Update" }, "template name"], [{ body: "Hello {{2}}, see you!" }, "consecutive"],
    [{ body: "{{1}} hello there." }, "meaningful text"], [{ body: "Hello {{1}}{{2}}, welcome!" }, "meaningful text"],
    [{ variables: [{ position: 1, sample: "Aarav" }] }, "example"], [{ header: "Hello {{1}}" }, "Header"],
    [{ body: "Hello {{name}}, welcome!" }, "consecutive"], [{ body: "x".repeat(1025) }, "1024"],
    [{ buttons: [{ type: "URL", text: "Open", url: "javascript:alert(1)" }] }, "URL"],
    [{ buttons: [{ type: "URL", text: "Open", url: "https://example.com/{{1}}" }] }, "URL"],
  ])("rejects invalid template fields %j", (override, message) => { expect(validateTemplateDraft({ ...draft, ...override }).error).toContain(message); });
  it("does not claim unsupported imported template components are sendable", () => {
    expect(templateSendSupport([{ type: "HEADER", format: "IMAGE" }])).toContain("media");
    expect(templateSendSupport([{ type: "BODY", text: "Hi {{name}}" }])).toContain("named");
    expect(templateSendSupport(templateComponents(validateTemplateDraft(draft).draft!))).toBe("");
  });
  it("replaces values literally without interpreting replacement-string syntax", () => {
    expect(renderTemplateBody("Hi {{1}}, your code is {{2}}.", ["$& <name>", "123"])).toBe("Hi $& <name>, your code is 123.");
  });
});
