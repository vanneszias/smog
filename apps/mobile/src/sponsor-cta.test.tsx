import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { Linking, Platform } from "react-native";
import { sponsorLinkShown } from "./sponsor-cta";
import { HOND, renderApp, rpcError } from "./test/harness";

const SPONSOR_GESTURE_HOND = /\/sponsor\?gesture=hond$/;

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

// `SPONSOR_LINK_IN_APP`, switchable per test (read when the card renders).
let mockLinkInApp = true;
jest.mock("./config", () => ({
  get SPONSOR_LINK_IN_APP() {
    return mockLinkInApp;
  },
}));

const LIVE_UNTIL = Date.UTC(2027, 4, 12, 10);

function availability(
  item: Record<string, unknown>,
  checkoutEnabled = true
): unknown {
  return {
    checkoutEnabled,
    items: [{ gestureId: HOND.id, state: "available", ...item }],
  };
}

async function card(): Promise<ReturnType<typeof within>> {
  return within(await screen.findByTestId("sponsor-cta"));
}

afterEach(() => {
  mockLinkInApp = true;
  jest.restoreAllMocks();
});

describe("the gesture's sponsor card on mobile (L-17, ruling 13)", () => {
  it("drops the link only on iOS with SPONSOR_LINK_IN_APP off (guideline 3.1.1)", () => {
    expect(sponsorLinkShown("ios", true)).toBe(true);
    expect(sponsorLinkShown("ios", false)).toBe(false);
    expect(sponsorLinkShown("android", false)).toBe(true);
  });

  it("an available gesture opens the site's wizard in the system browser", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderApp({
      initialUrl: "/gestures/hond",
      routes: { "sponsorships/availability": availability({}) },
    });
    const cta = await card();
    expect(cta.getByText("Sponsor this gesture")).toBeOnTheScreen();
    fireEvent.press(cta.getByRole("button", { name: "Sponsor now" }));
    expect(openURL).toHaveBeenCalledWith(
      expect.stringMatching(SPONSOR_GESTURE_HOND)
    );
  });

  it("hides an available gesture's card on iOS when the flag is off", async () => {
    expect(Platform.OS).toBe("ios");
    mockLinkInApp = false;
    const { fetch } = await renderApp({
      initialUrl: "/gestures/hond",
      routes: { "sponsorships/availability": availability({}) },
    });
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([request]) =>
          request.url.includes("sponsorships/availability")
        )
      ).toBe(true)
    );
    await screen.findByText("Het gebaar voor hond.");
    expect(screen.queryByTestId("sponsor-cta")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sponsor now" })).toBeNull();
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    "a sponsored gesture names the sponsor; with the link flag %p the date shows: %p (review Minor 13)",
    async (flag, dated) => {
      mockLinkInApp = flag;
      await renderApp({
        initialUrl: "/gestures/hond",
        routes: {
          "sponsorships/availability": availability(
            {
              endsAt: LIVE_UNTIL,
              sponsorName: "Bakkerij Jansen",
              state: "sponsored",
            },
            false
          ),
        },
      });
      const cta = await card();
      expect(
        cta.getByText("This gesture is sponsored by Bakkerij Jansen.")
      ).toBeOnTheScreen();
      // On iOS without the link, "available again from" would still point
      // at a purchase outside the app (guideline 3.1.1 anti-steering).
      const date = cta.queryByText(
        "It will be available for sponsoring again from 12 May 2027."
      );
      expect(date !== null).toBe(dated);
    }
  );

  it("a pending gesture says so, without a link", async () => {
    await renderApp({
      initialUrl: "/gestures/hond",
      routes: {
        "sponsorships/availability": availability({ state: "pending" }),
      },
    });
    const cta = await card();
    expect(cta.getByText("This gesture is being sponsored.")).toBeOnTheScreen();
    expect(cta.queryByRole("button")).toBeNull();
  });

  it("hides itself on an availability error (the page never waits on it)", async () => {
    await renderApp({
      initialUrl: "/gestures/hond",
      routes: {
        "sponsorships/availability": {
          response: rpcError("INTERNAL_SERVER_ERROR", 500),
        },
      },
    });
    await screen.findByText("Het gebaar voor hond.");
    expect(screen.queryByTestId("sponsor-cta")).toBeNull();
  });
});
