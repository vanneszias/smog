import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKit } from "../test/render";
import { AppBanner, OpenInAppBanner } from "./app-banner";

const APP_STORE = "https://apps.apple.com/app/smog-co/id6758547774";
const PLAY = "https://play.google.com/store/apps/details?id=be.zias.smog";
const APP_STORE_NAME = /App Store/;
const GOOGLE_PLAY_NAME = /Google Play/;
const APP_STORE_NL = /Download in de/;

describe("AppBanner", () => {
  test("a labelled region with the badge, the copy and both store links", () => {
    renderKit(
      <AppBanner
        appStoreUrl={APP_STORE}
        googlePlayUrl={PLAY}
        onDismiss={mock()}
      />
    );
    const region = screen.getByRole("region", {
      name: "SMOG is now available on your phone!",
    });
    expect(region.textContent).toContain("New");
    expect(region.textContent).toContain("learn gestures wherever you are");
    const appStore = screen.getByRole("link", { name: APP_STORE_NAME });
    expect(appStore.getAttribute("href")).toBe(APP_STORE);
    const play = screen.getByRole("link", { name: GOOGLE_PLAY_NAME });
    expect(play.getAttribute("href")).toBe(PLAY);
    for (const link of [appStore, play]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  test("the close button dismisses it", async () => {
    const onDismiss = mock();
    renderKit(
      <AppBanner
        appStoreUrl={APP_STORE}
        googlePlayUrl={PLAY}
        onDismiss={onDismiss}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Close the app banner" })
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("Dutch copy", () => {
    renderKit(
      <AppBanner
        appStoreUrl={APP_STORE}
        googlePlayUrl={PLAY}
        onDismiss={mock()}
      />,
      "nl"
    );
    expect(
      screen.getByRole("region", {
        name: "SMOG is nu beschikbaar op je telefoon!",
      })
    ).toBeDefined();
    expect(screen.getByRole("link", { name: APP_STORE_NL })).toBeDefined();
  });
});

describe("OpenInAppBanner", () => {
  test("links to the universal link and reports the click", async () => {
    const onOpen = mock((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    renderKit(
      <OpenInAppBanner
        href="https://smog.test/gestures/hallo"
        onOpen={onOpen}
      />
    );
    const region = screen.getByRole("region", { name: "Have the SMOG app?" });
    expect(region.textContent).toContain("View this gesture in the app.");
    const link = screen.getByRole("link", { name: "Open in the app" });
    expect(link.getAttribute("href")).toBe("https://smog.test/gestures/hallo");
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
