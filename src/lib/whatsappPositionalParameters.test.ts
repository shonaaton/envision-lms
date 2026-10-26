import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsappAutomation", () => ({}));
vi.mock("@/lib/whatsappAutomationSettings", () => ({}));

import { positionalParameters } from "./whatsappAutomationEvents";

describe("positionalParameters", () => {
  it("keeps a blank variable in its slot instead of sliding the next one in", () => {
    expect(positionalParameters(["Aarav", "", "Sat 1 Nov", 0], 4)).toEqual(["Aarav", "-", "Sat 1 Nov", "0"]);
  });

  it("drops trailing blanks", () => {
    expect(positionalParameters(["Aarav", "x", "", ""])).toEqual(["Aarav", "x"]);
  });

  it("still drops blanks when that is what makes the count match the template", () => {
    expect(positionalParameters(["Aarav", "", "x"], 2)).toEqual(["Aarav", "x"]);
  });
});
