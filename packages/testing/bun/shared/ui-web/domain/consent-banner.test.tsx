import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentBanner } from "../../../../../ui-web/src/domain/consent-banner";
import { classesOf, renderKit } from "../../../../support/ui-web/render";

describe("ConsentBanner", () => {
  test("a labelled region with the copy, the privacy link and two choices", () => {
    renderKit(
      <ConsentBanner
        onAllow={mock()}
        onDecline={mock()}
        privacyHref="/privacy"
      />
    );
    const region = screen.getByRole("region", {
      name: "Help us improve SMOG\u00a0&\u00a0Co",
    });
    expect(region.textContent).toContain("limited usage statistics");
    const link = screen.getByRole("link", { name: "Read the privacy policy" });
    expect(link.getAttribute("href")).toBe("/privacy");
    expect(
      screen.getByRole("button", { name: "Allow statistics" })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Don’t allow" })).toBeDefined();
  });

  test("the buttons report the choice", async () => {
    const onAllow = mock();
    const onDecline = mock();
    renderKit(
      <ConsentBanner onAllow={onAllow} onDecline={onDecline} privacyHref="/p" />
    );
    await userEvent.click(screen.getByRole("button", { name: "Don’t allow" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Allow statistics" })
    );
    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  test("both choices have the same size (equally visible)", () => {
    renderKit(
      <ConsentBanner onAllow={mock()} onDecline={mock()} privacyHref="/p" />
    );
    const allow = classesOf(
      screen.getByRole("button", { name: "Allow statistics" })
    );
    const decline = classesOf(
      screen.getByRole("button", { name: "Don’t allow" })
    );
    const sizes = (list: string[]): string[] =>
      list.filter((name) => name.startsWith("h-") || name.startsWith("min-h"));
    expect(sizes(allow)).toEqual(sizes(decline));
  });

  test("busy disables both choices", () => {
    renderKit(
      <ConsentBanner
        busy
        onAllow={mock()}
        onDecline={mock()}
        privacyHref="/p"
      />
    );
    for (const name of ["Allow statistics", "Don’t allow"]) {
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  test("floats at the bottom of the viewport unless inline", () => {
    const { unmount } = renderKit(
      <ConsentBanner onAllow={mock()} onDecline={mock()} privacyHref="/p" />
    );
    expect(classesOf(screen.getByRole("region"))).toContain("fixed");
    unmount();
    renderKit(
      <ConsentBanner
        inline
        onAllow={mock()}
        onDecline={mock()}
        privacyHref="/p"
      />
    );
    expect(classesOf(screen.getByRole("region"))).not.toContain("fixed");
  });

  test("Dutch copy", () => {
    renderKit(
      <ConsentBanner onAllow={mock()} onDecline={mock()} privacyHref="/p" />,
      "nl"
    );
    expect(
      screen.getByRole("region", {
        name: "Help ons SMOG\u00a0&\u00a0Co beter maken",
      })
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Niet toestaan" })).toBeDefined();
  });
});
