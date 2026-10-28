import { describe, expect, it } from "vitest";
import { sponsorshipLinkUrl } from "../../../../features/sponsorships/src/schema/tokens";

const TOKEN = "Ab_-".repeat(10).concat("xyz");

describe("sponsorshipLinkUrl (phase 9 ruling 7)", () => {
  it("puts the token in the fragment, never in a query", () => {
    for (const purpose of ["reedit", "renewal"] as const) {
      const url = sponsorshipLinkUrl("https://smog.test", purpose, TOKEN);
      const parsed = new URL(url);
      expect(parsed.search).toBe("");
      expect(parsed.hash).toBe(`#token=${TOKEN}`);
      expect(url).not.toContain("?");
    }
  });

  it("points at the right page and tolerates a trailing slash", () => {
    expect(sponsorshipLinkUrl("https://smog.test/", "reedit", "t")).toBe(
      "https://smog.test/sponsor/edit#token=t"
    );
    expect(sponsorshipLinkUrl("https://smog.test", "renewal", "t")).toBe(
      "https://smog.test/sponsor/renew#token=t"
    );
  });
});
