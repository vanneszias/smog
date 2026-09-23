import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { ApiError } from "./api";
import { REDIRECT_URI, signInWithGoogle } from "./google";

jest.mock("expo-web-browser");
jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

describe("signInWithGoogle", () => {
  beforeEach(() => jest.resetAllMocks());

  it("stores nothing and throws nothing when the flow is cancelled", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "dismiss",
    });
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(signInWithGoogle()).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("throws rather than silently appearing to sign in when the callback carries no code", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "success",
      url: `${REDIRECT_URI}?nothing=here`,
    });
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(signInWithGoogle()).rejects.toBeInstanceOf(ApiError);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  /**
   * The property the exchange exists for: the code that rides in the
   * callback URL is not a credential, and what ends up in the keychain is
   * whatever `POST /mobile/session` answers, never the code itself.
   */
  it("stores the token the exchange returns, not the code from the callback URL", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "success",
      url: `${REDIRECT_URI}?code=exchange-code-not-a-session`,
    });
    global.fetch = jest.fn(() =>
      json({ token: "real-session-token", user: { id: "1" } })
    ) as unknown as typeof fetch;

    await signInWithGoogle();

    const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];

    expect(url).toContain("/mobile/session");
    expect(JSON.parse(init.body)).toEqual({
      code: "exchange-code-not-a-session",
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      "real-session-token"
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
      expect.any(String),
      "exchange-code-not-a-session"
    );
  });

  it("throws without storing anything when the exchange refuses the code", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "success",
      url: `${REDIRECT_URI}?code=already-used`,
    });
    global.fetch = jest.fn(() =>
      json({ status: "invalid-code" }, 401)
    ) as unknown as typeof fetch;

    await expect(signInWithGoogle()).rejects.toBeInstanceOf(ApiError);

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
