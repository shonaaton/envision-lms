import { describe, expect, it } from "vitest";
import { kolkataCentres } from "@/lib/centrePages";
import { CONTACT_INTEREST_VALUES, contactInterestLabel, whatsappDigits } from "@/lib/contactEnquiries";
import { enquiryHref, parseEnquiryFilters } from "@/lib/contactEnquiryInbox";

describe("contact interests", () => {
  it("offers online plus every Kolkata centre", () => {
    expect(CONTACT_INTEREST_VALUES).toEqual(["online", ...kolkataCentres.map((centre) => centre.slug)]);
  });

  it("names the option a salesperson sees in the inbox", () => {
    expect(contactInterestLabel("online")).toBe("Online classes");
    expect(contactInterestLabel("jodhpur-park")).toBe("Jodhpur Park centre");
    expect(contactInterestLabel("behala")).toBe("Not specified");
  });
});

describe("whatsappDigits", () => {
  it("prefixes the dialling code when the number does not carry it", () => {
    expect(whatsappDigits("+91", "98312 48613")).toBe("919831248613");
  });

  it("leaves a number that already carries its own code alone", () => {
    expect(whatsappDigits("+91", "919831248613")).toBe("919831248613");
  });

  it("drops a leading zero from the national number", () => {
    expect(whatsappDigits("+91", "09831248613")).toBe("919831248613");
  });

  it("returns nothing when there is no number to dial", () => {
    expect(whatsappDigits("+91", "")).toBe("");
  });
});

describe("parseEnquiryFilters", () => {
  it("defaults to page one with no filters", () => {
    expect(parseEnquiryFilters({})).toEqual({ page: 1, status: "all", interest: "all", query: "" });
  });

  it("ignores a status or interest that is not one of ours", () => {
    const filters = parseEnquiryFilters({ status: "spam", interest: "behala", page: "0" });
    expect(filters.status).toBe("all");
    expect(filters.interest).toBe("all");
    expect(filters.page).toBe(1);
  });

  it("accepts the real values", () => {
    const filters = parseEnquiryFilters({ status: "contacted", interest: "bowbazar", page: "3", q: " Ananya " });
    expect(filters).toEqual({ page: 3, status: "contacted", interest: "bowbazar", query: "Ananya" });
  });
});

describe("enquiryHref", () => {
  it("keeps the other filters when paging", () => {
    const filters = parseEnquiryFilters({ status: "new", q: "Ananya" });
    expect(enquiryHref(filters, { page: 2 })).toBe("/sales/enquiries?status=new&q=Ananya&page=2");
  });

  it("drops defaults rather than spelling them out", () => {
    expect(enquiryHref(parseEnquiryFilters({}), {})).toBe("/sales/enquiries");
  });

  it("resets to the first page when the status tab changes", () => {
    const filters = parseEnquiryFilters({ status: "new", page: "4" });
    expect(enquiryHref(filters, { status: "closed", page: 1 })).toBe("/sales/enquiries?status=closed");
  });
});
