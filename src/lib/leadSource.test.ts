import { describe, expect, it } from "vitest";
import { leadChannel, leadSourceLine, sanitizeLeadSource, summarizeLeadSource } from "@/lib/leadSource";

// What Meta's ad link looks like once Meta has filled in its {{...}} macros.
const metaClick = {
  utm_source: "ig",
  utm_medium: "paid_social",
  utm_campaign: "Screen time - Kolkata parents",
  utm_id: "120210000000000001",
  utm_term: "Parents 28-45",
  utm_content: "Reel - board close-up",
  campaign_id: "120210000000000001",
  adset_id: "120210000000000002",
  ad_id: "120210000000000003",
  placement: "Instagram_Reels",
  landingPath: "/book-free-demo-class",
};

describe("lead source", () => {
  it("reads a Meta ad click into channel, platform and the ad's names", () => {
    const summary = summarizeLeadSource(sanitizeLeadSource(metaClick));
    expect(summary.channel).toBe("meta_ad");
    expect(summary.headline).toBe("Meta ad · Instagram");
    expect(summary.details).toEqual(
      expect.arrayContaining([
        { label: "Campaign", value: "Screen time - Kolkata parents" },
        { label: "Ad set", value: "Parents 28-45" },
        { label: "Ad", value: "Reel - board close-up" },
        { label: "Placement", value: "Instagram Reels" },
        { label: "Ad ID", value: "120210000000000003" },
      ]),
    );
    expect(leadSourceLine(metaClick)).toBe(
      "Meta ad · Instagram | Campaign: Screen time - Kolkata parents | Ad set: Parents 28-45 | Ad: Reel - board close-up | Placement: Instagram Reels",
    );
  });

  it("names Facebook and the other Meta apps", () => {
    expect(summarizeLeadSource({ ...metaClick, utm_source: "fb" }).headline).toBe("Meta ad · Facebook");
    expect(summarizeLeadSource({ ...metaClick, utm_source: "an" }).headline).toBe("Meta ad · Audience Network");
  });

  it("drops macros Meta did not fill in, as in an ad preview", () => {
    const source = sanitizeLeadSource({ utm_source: "{{site_source_name}}", utm_medium: "paid_social", utm_campaign: "{{campaign.name}}", ad_id: "{{ad.id}}" });
    expect(source).toEqual({ utm_medium: "paid_social" });
    // paid_social on its own still means our Meta ads, the only paid social links to this page.
    expect(leadChannel(source)).toBe("meta_ad");
  });

  it("tells website visitors apart by where they came from", () => {
    expect(summarizeLeadSource({ referrer: "google.com", landingPath: "/book-free-demo-class" }).headline).toBe("Search engine · google.com");
    expect(leadChannel({ referrer: "m.facebook.com" })).toBe("social");
    expect(leadChannel({ referrer: "l.instagram.com" })).toBe("social");
    expect(leadChannel({ referrer: "someblog.in" })).toBe("referral");
    expect(summarizeLeadSource({ landingPath: "/book-free-demo-class" }).headline).toBe("Website (direct)");
    expect(summarizeLeadSource(undefined).headline).toBe("Not recorded");
  });

  it("knows a Google ad click and a plain tagged link", () => {
    expect(leadChannel({ gclid: "abc" })).toBe("google_ad");
    expect(leadChannel({ utm_source: "newsletter", utm_medium: "email" })).toBe("campaign");
  });

  it("keeps only known tags, trimmed to size, and a clean landing path", () => {
    const source = sanitizeLeadSource({ utm_campaign: "x".repeat(500), evil: "<script>", landingPath: "/book-free-demo-class?utm_source=ig", referrer: "WWW.Google.com" });
    expect(source.utm_campaign).toHaveLength(200);
    expect(source).not.toHaveProperty("evil");
    expect(source.landingPath).toBe("/book-free-demo-class");
    expect(source.referrer).toBe("google.com");
    expect(sanitizeLeadSource("not an object")).toEqual({});
  });
});
