import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { Linking } from "react-native";
import type { TestInstance } from "test-renderer";
import {
  clearMagicLinkRequest,
  isMagicLinkPending,
  markMagicLinkRequested,
} from "./auth/magic-link-request";
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

const SITE = "https://smog.test";
const EMAIL = "an@smog.test";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";
const OK = { data: { success: true }, error: null };

function authConfig(turnstileSiteKey: string | null) {
  return {
    "system/authConfig": { apple: false, google: false, turnstileSiteKey },
  };
}

function bridgeMessage(message: Record<string, unknown>, url: string) {
  return {
    nativeEvent: {
      data: JSON.stringify({ source: "smog-turnstile", ...message }),
      url,
    },
  };
}

async function webview(): Promise<TestInstance> {
  return await screen.findByTestId("turnstile-webview");
}

/** Email step → the code method (a captcha-guarded request). */
async function chooseEmailCode(): Promise<void> {
  await fireEvent.changeText(
    await screen.findByPlaceholderText("name@example.com"),
    EMAIL
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "With a code by email" })
  );
}

describe("sign-in with Turnstile on (the WebView sheet)", () => {
  it("asks the bridge for a token and sends it with the request", async () => {
    const sendVerificationOtp = jest.fn(() => Promise.resolve(OK));
    await renderApp({
      auth: { emailOtp: { sendVerificationOtp } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig("site-key"),
    });
    // The config must be loaded before the method is chosen.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("name@example.com")).toBeOnTheScreen()
    );
    await act(() => Promise.resolve());
    await chooseEmailCode();

    const view = await webview();
    expect(view.props.source).toEqual({
      uri: `${SITE}/turnstile-bridge?lang=en`,
    });
    expect(view.props.originWhitelist).toEqual([
      SITE,
      "https://challenges.cloudflare.com",
    ]);
    expect(sendVerificationOtp).not.toHaveBeenCalled();

    // Another origin (a navigated frame, a spoofed message) is ignored.
    await act(() =>
      view.props.onMessage(
        bridgeMessage({ token: "evil", type: "token" }, "https://evil.test/")
      )
    );
    expect(sendVerificationOtp).not.toHaveBeenCalled();

    await act(() =>
      view.props.onMessage(
        bridgeMessage(
          { token: "tok-1", type: "token" },
          `${SITE}/turnstile-bridge?lang=en`
        )
      )
    );
    await waitFor(() =>
      expect(sendVerificationOtp).toHaveBeenCalledWith({
        email: EMAIL,
        fetchOptions: { headers: { "x-captcha-response": "tok-1" } },
        type: "sign-in",
      })
    );
    // Single use: the sheet is gone with its token.
    await waitFor(() =>
      expect(screen.queryByTestId("turnstile-webview")).not.toBeOnTheScreen()
    );
    expect(await screen.findByText("Enter your code")).toBeOnTheScreen();
  });

  it("only lets the WebView load the site and Cloudflare's frames", async () => {
    await renderApp({
      auth: { emailOtp: { sendVerificationOtp: jest.fn() } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig("site-key"),
    });
    await act(() => Promise.resolve());
    await chooseEmailCode();
    const { props } = await webview();
    // The library's own gate (whitelist first, then our handler), as the
    // native side calls it for every navigation, iframes included on iOS.
    const { createOnShouldStartLoadWithRequest } = jest.requireActual<
      typeof import("react-native-webview/lib/WebViewShared")
    >("react-native-webview/lib/WebViewShared");
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const canOpenURL = jest
      .spyOn(Linking, "canOpenURL")
      .mockResolvedValue(true);
    const decisions: [boolean, string][] = [];
    const gate = createOnShouldStartLoadWithRequest(
      (shouldStart: boolean, url: string) => {
        decisions.push([shouldStart, url]);
      },
      props.originWhitelist,
      props.onShouldStartLoadWithRequest
    );
    const load = (url: string, isTopFrame: boolean): void =>
      gate({ nativeEvent: { isTopFrame, lockIdentifier: 1, url } } as never);

    const challenge =
      "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x";
    load(`${SITE}/turnstile-bridge?lang=en`, true);
    load(challenge, false);
    load("https://evil.test/", true);
    load("https://evil.test/", false);
    load(challenge, true);
    // The library's whitelist is a prefix match; our exact check is not.
    load("https://smog.test.evil.test/", true);
    await act(() => Promise.resolve());

    expect(decisions).toEqual([
      [true, `${SITE}/turnstile-bridge?lang=en`],
      [true, challenge],
      [false, "https://evil.test/"],
      [false, "https://evil.test/"],
      [false, challenge],
      [false, "https://smog.test.evil.test/"],
    ]);
    // Refused loads outside the whitelist go to the OS, but never the
    // challenge frame (the iOS bug: Safari popping up with it).
    expect(openURL).not.toHaveBeenCalledWith(challenge);
    openURL.mockRestore();
    canOpenURL.mockRestore();
  });

  it("closing the sheet sends nothing and lets the user try again", async () => {
    const sendVerificationOtp = jest.fn(() => Promise.resolve(OK));
    await renderApp({
      auth: { emailOtp: { sendVerificationOtp } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig("site-key"),
    });
    await act(() => Promise.resolve());
    await chooseEmailCode();
    await webview();
    await fireEvent.press(
      within(screen.getByTestId("turnstile-sheet")).getByRole("button", {
        name: "Close",
      })
    );
    await waitFor(() =>
      expect(screen.queryByTestId("turnstile-webview")).not.toBeOnTheScreen()
    );
    expect(sendVerificationOtp).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "With a code by email" })
    ).toBeEnabled();
  });

  it("a failed challenge shows a retry that reloads the widget", async () => {
    await renderApp({
      auth: { emailOtp: { sendVerificationOtp: jest.fn() } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig("site-key"),
    });
    await act(() => Promise.resolve());
    await chooseEmailCode();
    const first = await webview();
    await act(() =>
      first.props.onMessage(bridgeMessage({ type: "error" }, `${SITE}/x`))
    );
    expect(
      await screen.findByText(
        "The security check didn't work. Please try again."
      )
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await webview()).not.toBe(first);
  });

  it("without a site key the app asks for no captcha", async () => {
    const sendVerificationOtp = jest.fn(() => Promise.resolve(OK));
    await renderApp({
      auth: { emailOtp: { sendVerificationOtp } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig(null),
    });
    await act(() => Promise.resolve());
    await chooseEmailCode();
    await waitFor(() =>
      expect(sendVerificationOtp).toHaveBeenCalledWith({
        email: EMAIL,
        type: "sign-in",
      })
    );
    expect(screen.queryByTestId("turnstile-webview")).not.toBeOnTheScreen();
  });

  it("offers the magic link in the app", async () => {
    const magicLink = jest.fn(() => Promise.resolve(OK));
    await renderApp({
      auth: { signIn: { magicLink } },
      authScreens: true,
      initialUrl: "/sign-in",
      routes: authConfig(null),
    });
    await fireEvent.changeText(
      await screen.findByPlaceholderText("name@example.com"),
      EMAIL
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "With a sign-in link by email",
      })
    );
    await waitFor(() =>
      expect(magicLink).toHaveBeenCalledWith({
        callbackURL: "/",
        email: EMAIL,
        errorCallbackURL: "/",
        newUserCallbackURL: "/",
      })
    );
    expect(await screen.findByText("Check your inbox")).toBeOnTheScreen();
    // The app remembers it asked, so the link exchanges without a prompt.
    expect(isMagicLinkPending()).toBe(true);
  });
});

describe("the app's magic link", () => {
  const OTHER = "other@smog.test";
  const LINK = `/magic-link/app?token=${TOKEN}`;
  const verified = (email = EMAIL) =>
    jest.fn(() =>
      Promise.resolve({
        data: {
          session: { id: "s" },
          token: "session",
          user: { email, id: "u" },
        },
        error: null,
      })
    );

  beforeEach(() => {
    clearMagicLinkRequest();
  });

  it("exchanges at once while this app has a link request pending", async () => {
    markMagicLinkRequested(EMAIL);
    const verify = verified();
    const { result } = await renderApp({
      auth: { magicLink: { verify } },
      initialUrl: LINK,
    });
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith({ query: { token: TOKEN } })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/"));
    // The toast names the account of the new session.
    expect(
      await screen.findByText(`You're signed in as ${EMAIL}.`)
    ).toBeOnTheScreen();
  });

  it.each([
    ["no request from this app", () => undefined],
    [
      "a request older than the link's lifetime",
      () => markMagicLinkRequested(EMAIL, Date.now() - 301_000),
    ],
  ])("with %s it asks first (a tap signs in)", async (_label, arrange) => {
    arrange();
    const verify = verified(OTHER);
    await renderApp({ auth: { magicLink: { verify } }, initialUrl: LINK });
    expect(
      await screen.findByRole("header", {
        name: "Sign in with the link from your email?",
      })
    ).toBeOnTheScreen();
    // No address is shown before the exchange (the link carries none).
    expect(screen.queryByText(OTHER, { exact: false })).not.toBeOnTheScreen();
    expect(verify).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(`You're signed in as ${OTHER}.`)
    ).toBeOnTheScreen();
  });

  it("never switches a signed-in user without asking", async () => {
    markMagicLinkRequested(OTHER);
    const verify = verified(OTHER);
    const signOut = jest.fn(() => Promise.resolve({ data: {}, error: null }));
    await renderApp({
      auth: { magicLink: { verify }, signOut },
      initialUrl: LINK,
      signedIn: true,
    });
    expect(
      await screen.findByRole("header", { name: "Switch account?" })
    ).toBeOnTheScreen();
    expect(
      screen.getByText(`You're signed in as ${EMAIL}.`, { exact: false })
    ).toBeOnTheScreen();
    expect(verify).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Switch account" })
    );
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalled();
  });

  it("cancel keeps the current account and sends nothing", async () => {
    const verify = verified(OTHER);
    const { result } = await renderApp({
      auth: { magicLink: { verify } },
      initialUrl: LINK,
      signedIn: true,
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Cancel" })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(verify).not.toHaveBeenCalled();
  });

  it("an automatic exchange into another account than requested is undone", async () => {
    markMagicLinkRequested(EMAIL);
    const verify = verified(OTHER);
    const signOut = jest.fn(() => Promise.resolve({ data: {}, error: null }));
    await renderApp({
      auth: { magicLink: { verify }, signOut },
      initialUrl: LINK,
    });
    expect(
      await screen.findByText("This link signs in to another account.")
    ).toBeOnTheScreen();
    expect(signOut).toHaveBeenCalled();
  });

  it("an expired or used link says so and offers sign-in", async () => {
    markMagicLinkRequested(EMAIL);
    const verify = jest.fn(() =>
      Promise.resolve({ data: null, error: { status: 302 } })
    );
    await renderApp({ auth: { magicLink: { verify } }, initialUrl: LINK });
    expect(
      await screen.findByText("This link has expired or is no longer valid.")
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Send the link again" })
    ).toBeOnTheScreen();
  });

  it("a link without a valid token never calls the server", async () => {
    const verify = jest.fn();
    await renderApp({
      auth: { magicLink: { verify } },
      initialUrl: "/magic-link/app?token=short",
    });
    expect(
      await screen.findByText("This link has expired or is no longer valid.")
    ).toBeOnTheScreen();
    expect(verify).not.toHaveBeenCalled();
  });
});
