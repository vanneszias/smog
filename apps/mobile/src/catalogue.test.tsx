import { describe, expect, it, jest } from "@jest/globals";
import { screen, within } from "expo-router/testing-library";
import { renderApp } from "./test/harness";

// The real auth client (Better Auth, SecureStore) is never built: tests pass fakes.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../global.css", () => ({}));
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: () => undefined,
      toggleColorScheme: () => undefined,
    }),
  };
});

/*
 * The runtime catalogue on the device (phase 10b task 3): the app starts
 * from its bundled catalogue, fetches `system.i18n` and merges the overlay
 * over it; an offline or failing fetch leaves the bundle as it is.
 */

const LANGUAGES = [
  { code: "nl", intlTag: "nl-BE", isDefault: true, name: "Nederlands" },
  { code: "en", intlTag: "en-BE", isDefault: false, name: "English" },
  { code: "fr", intlTag: "fr-BE", isDefault: false, name: "Français" },
];

async function home(): Promise<ReturnType<typeof within>> {
  return within(await screen.findByTestId("home-screen"));
}

describe("the runtime catalogue", () => {
  it("shows an overlay edit over the bundled text", async () => {
    await renderApp({
      routes: {
        "system/i18n": {
          languages: LANGUAGES,
          locale: "en",
          overlay: { en: { "home.featured": "Our favourites" } },
          version: "v1",
        },
      },
    });
    const screenHome = await home();
    expect(
      await screenHome.findByRole("header", { name: "Our favourites" })
    ).toBeOnTheScreen();
    // Everything else stays the bundled English text.
    expect(
      screenHome.getByRole("header", {
        name: "Gestures that support your speech",
      })
    ).toBeOnTheScreen();
  });

  it("works from the bundled catalogue when the catalogue cannot be fetched", async () => {
    await renderApp({
      fetch: () => Promise.reject(new TypeError("Network request failed")),
    });
    const screenHome = await home();
    expect(
      await screenHome.findByRole("header", {
        name: "Gestures that support your speech",
      })
    ).toBeOnTheScreen();
  });
});
