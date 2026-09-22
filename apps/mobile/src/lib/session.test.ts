import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { ApiError, payloadFetch } from "./api";
import { readGuestFavorites, toggleGuestFavorite } from "./guest";
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

const LOGIN_OK = () => json({ token: "t", user: { id: "1" } });

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
 * The guest-favourites merge that runs inside `signIn`.
 *
 * **A private in-memory store, reinstalled every test, rather than the
 * shared `@react-native-async-storage/async-storage` jest mock's own
 * default implementation.** That mock is a module-level singleton, loaded
 * once for this whole file, and the "the session" describe above calls
 * `jest.resetAllMocks()` in its own `beforeEach` — which does not merely
 * clear call history, it strips the *implementation* `getItem`/`setItem`
 * ship with, permanently, because nothing re-runs the `jest.mock()` factory
 * between tests. Once those tests run, every later test in this file that
 * calls `AsyncStorage.getItem` gets back `undefined` rather than a working
 * read. `toggleGuestFavorite`/`readGuestFavorites` need it to actually work
 * here, so this block gives it one that does not depend on file order.
 */
describe("the guest-favourites merge on sign-in", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(store[key] ?? null)
    );
    (
      AsyncStorage.setItem as unknown as jest.Mock<
        Promise<void>,
        [string, string]
      >
    ).mockImplementation((key, value) => {
      store[key] = value;
      return Promise.resolve();
    });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      delete store[key];
      return Promise.resolve();
    });
  });

  it("merges the device's favourites into the account on sign-in", async () => {
    await toggleGuestFavorite("a");

    global.fetch = jest
      .fn()
      .mockImplementationOnce(LOGIN_OK) // POST /users/login
      .mockImplementationOnce(() =>
        json({ added: ["a"], favorites: ["a"] })
      ) as unknown as typeof fetch; // POST /account/merge-favorites

    await signIn("a@b.test", "pw");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/account/merge-favorites"),
      expect.objectContaining({
        body: JSON.stringify({ ids: ["a"] }),
        method: "POST",
      })
    );
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  /**
   * The load-bearing one. A fixture that made *every* fetch call reject —
   * including the login itself — would pass this even with the clear moved
   * above the merge request: `signIn` would already have thrown from the
   * login before either statement ran, and the assertion below would never
   * have been exercised by the code it is meant to guard. So login and merge
   * are given distinct outcomes here: the first call (login) succeeds, the
   * second (merge) fails, which is the only fixture that actually reaches
   * the ordering this test is named for.
   *
   * Step 5 of the task brief: with `clearGuestFavorites()` moved above the
   * merge request in `session.ts`, this test fails — see the task report for
   * the pasted transcript.
   */
  it("clears the device's copy only after the merge succeeds", async () => {
    await toggleGuestFavorite("a");

    global.fetch = jest
      .fn()
      .mockImplementationOnce(LOGIN_OK) // POST /users/login succeeds
      .mockImplementationOnce(() =>
        Promise.reject(new TypeError("offline"))
      ) as unknown as typeof fetch; // POST /account/merge-favorites fails

    // The merge failure is not a sign-in failure: the password was correct
    // and the token is already stored by the time the merge runs.
    await expect(signIn("a@b.test", "pw")).resolves.toBeUndefined();
    await expect(readGuestFavorites()).resolves.toEqual(["a"]);
  });

  it("does not merge an empty device list", async () => {
    global.fetch = jest.fn(LOGIN_OK) as unknown as typeof fetch;

    await signIn("a@b.test", "pw");

    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("merge-favorites"),
      expect.anything()
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
