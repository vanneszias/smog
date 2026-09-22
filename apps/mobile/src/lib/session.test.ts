import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { ApiError, payloadFetch } from "./api";
import {
  getToken,
  INSTALL_MARKER,
  refresh,
  signIn,
  signOut,
  signUp,
  TOKEN_KEY,
} from "./session";

jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

describe("the session", () => {
  beforeEach(() => jest.resetAllMocks());

  it("stores the token that sign-in returns", async () => {
    global.fetch = jest.fn(() =>
      json({ token: "t", user: { id: "1" } })
    ) as unknown as typeof fetch;

    await signIn("a@b.test", "pw");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      "t"
    );
  });

  it("stores nothing when sign-in fails", async () => {
    global.fetch = jest.fn(() =>
      json({ errors: [{ message: "x" }] }, 401)
    ) as unknown as typeof fetch;

    await expect(signIn("a@b.test", "pw")).rejects.toBeInstanceOf(ApiError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("sends the stored token on an authenticated request", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      json({ user: { id: "1" } })
    ) as unknown as typeof fetch;

    await payloadFetch("/users/me", { auth: true });

    const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];

    expect(new Headers(init.headers).get("Authorization")).toBe("JWT t");
  });

  it("clears the token on a 401 rather than retrying for ever", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("stale");
    global.fetch = jest.fn(() =>
      json({ errors: [{ message: "x" }] }, 401)
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/users/me", { auth: true })).rejects.toThrow();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("revokes server-side on sign-out, not only locally", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      json({ message: "ok" })
    ) as unknown as typeof fetch;

    await signOut();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/logout"),
      expect.objectContaining({ method: "POST" })
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("clears the token even when the logout request fails", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    await signOut();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("refreshes rather than signing out while the token is still valid", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      json({ refreshedToken: "t2" })
    ) as unknown as typeof fetch;

    await refresh();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      "t2"
    );
  });
});

/**
 * The reinstall case (Review Focus item 2): `expo-secure-store` items
 * survive an iOS app deletion, `AsyncStorage` does not, so a token with no
 * install marker beside it belongs to a previous installation.
 */
describe("the reinstall case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("clears a token left by a previous install and answers no session", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("stale-token");

    const token = await getToken();

    expect(token).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(INSTALL_MARKER, "1");
  });

  it("keeps the token once the install marker is already present", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");

    const token = await getToken();

    expect(token).toBe("t");
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns the outcome the server reports, for the free-address case", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "accepted" })
    ) as unknown as typeof fetch;

    await expect(
      signUp("new@example.test", "correct horse battery staple")
    ).resolves.toBe("accepted");
  });

  it("returns the outcome the server reports for a refusal, without throwing", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "weak-password" }, 400)
    ) as unknown as typeof fetch;

    await expect(signUp("new@example.test", "short")).resolves.toBe(
      "weak-password"
    );
  });

  it("stores no token, whatever the outcome", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "accepted" })
    ) as unknown as typeof fetch;

    await signUp("new@example.test", "correct horse battery staple");

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
