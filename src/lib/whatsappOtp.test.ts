import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtpCode, maskRecipient, otpTemplateMessage } from "@/lib/whatsappOtp";
import { getWhatsAppTemplateDefinition, whatsappOtpTemplateComponents, WHATSAPP_OTP_TEMPLATE_NAME } from "@/lib/whatsappTemplateRegistry";

describe("whatsapp otp", () => {
  it("makes six-digit codes", () => {
    for (let index = 0; index < 200; index += 1) expect(generateOtpCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it("ties a hash to its record, so a code cannot be replayed on another", () => {
    expect(hashOtpCode("a", "123456")).toBe(hashOtpCode("a", "123456"));
    expect(hashOtpCode("a", "123456")).not.toBe(hashOtpCode("b", "123456"));
    expect(hashOtpCode("a", "123456")).not.toContain("123456");
  });

  it("puts the code in both the body and the copy button", () => {
    const { template, to } = otpTemplateMessage("919831248613", "482913");
    expect(to).toBe("919831248613");
    expect(template.name).toBe(WHATSAPP_OTP_TEMPLATE_NAME);
    expect(template.components[0].parameters[0].text).toBe("482913");
    expect(template.components[1]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
    expect(template.components[1].parameters[0].text).toBe("482913");
  });

  it("is registered as an authentication template with Meta's fixed parts", () => {
    expect((getWhatsAppTemplateDefinition(WHATSAPP_OTP_TEMPLATE_NAME) as any)?.category).toBe("AUTHENTICATION");
    const components = whatsappOtpTemplateComponents();
    // Meta writes the body of an authentication template itself and refuses free text.
    expect(components[0]).toEqual({ type: "BODY", add_security_recommendation: true });
    expect(components[2].buttons?.[0]).toMatchObject({ type: "OTP", otp_type: "COPY_CODE" });
  });

  it("shows only the last four digits", () => {
    expect(maskRecipient("919831248613", "+91")).toBe("+91 ••••••8613");
  });
});
