import { describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import type { TestInstance } from "test-renderer";
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
    expect(view.props.originWhitelist).toEqual([SITE]);
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
    const allow = (await webview()).props
      .onShouldStartLoadWithRequest as (request: {
      isTopFrame?: boolean;
      url: string;
    }) => boolean;
    expect(allow({ isTopFrame: true, url: `${SITE}/turnstile-bridge` })).toBe(
      true
    );
    expect(allow({ isTopFrame: true, url: "https://evil.test/" })).toBe(false);
    expect(
      allow({
        isTopFrame: false,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x",
      })
    ).toBe(true);
    expect(allow({ isTopFrame: false, url: "https://evil.test/" })).toBe(false);
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
  });
});

describe("the app's magic link", () => {
  it("exchanges the token for a session and goes home", async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        data: { session: { id: "s" }, token: "session", user: { id: "u" } },
        error: null,
      })
    );
    const { result } = await renderApp({
      auth: { magicLink: { verify } },
      initialUrl: `/magic-link?token=${TOKEN}`,
    });
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith({ query: { token: TOKEN } })
    );
    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(await screen.findByText("You're signed in.")).toBeOnTheScreen();
  });

  it("an expired or used link says so and offers sign-in", async () => {
    const verify = jest.fn(() =>
      Promise.resolve({ data: null, error: { status: 302 } })
    );
    await renderApp({
      auth: { magicLink: { verify } },
      initialUrl: `/magic-link?token=${TOKEN}`,
    });
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
      initialUrl: "/magic-link",
    });
    expect(
      await screen.findByText("This link has expired or is no longer valid.")
    ).toBeOnTheScreen();
    expect(verify).not.toHaveBeenCalled();
  });
});
