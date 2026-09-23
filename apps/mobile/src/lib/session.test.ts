import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { ApiError, payloadFetch } from "./api";
import { readGuestFavorites, toggleGuestFavorite } from "./guest";
import {
  changePassword,
  deleteAccount,
  getToken,
  getVerifiedSession,
  INSTALL_MARKER,
  refresh,
  requestEmailChange,
  SessionProvider,
  setVerifiedSessionForTests,
  signIn,
  signOut,
  signUp,
  storeToken,
  TOKEN_KEY,
  useSession,
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
   * Checked by breaking it: with `clearGuestFavorites()` moved above the
   * merge request in `session.ts`, this test fails.
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
 * The reinstall case: `expo-secure-store` items
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

/**
 * `getVerifiedSession`, which `consentSync.ts` relies on: the token/account
 * pair `resolveSessionUser` most recently *confirmed*, which it may only set
 * once `/users/me` has actually answered, for that exact token, naming a real
 * user. `resolveSessionUser` itself is not exported, so these drive it the only
 * way anything outside this file can: through a mounted `SessionProvider`.
 *
 * An earlier version of this describe block asserted that
 * `getVerifiedSession`'s predecessor recorded a token the instant it was read,
 * before `/users/me` had answered — which was exactly the bug (a token could be
 * "verified" for an account that had not, in fact, been confirmed yet). The
 * tests below assert the opposite of that one, on purpose.
 */
describe("getVerifiedSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    // `verifiedSession` is module-level state that outlives any one test;
    // reset it so an earlier test's confirmed pair can't make this one
    // pass for the wrong reason.
    setVerifiedSessionForTests(null);
  });

  it("records the token and the account /users/me confirmed together", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      json({ user: { email: "a@b.test", id: "1", role: "user" } })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getVerifiedSession()).toEqual({ token: "t", userId: "1" });
  });

  it("records nothing when /users/me could not verify the token — never the token alone", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The bug this guards: this used to record `t` here regardless,
    // because it was written the instant the token was read rather than
    // once a response had actually confirmed whose it was.
    expect(getVerifiedSession()).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("leaves an earlier confirmed pair untouched when a later resolve for the same token fails", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() =>
      json({ user: { email: "a@b.test", id: "1", role: "user" } })
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getVerifiedSession()).toEqual({ token: "t", userId: "1" });

    // A later resolve for the very same token (not a switch) that happens
    // to fail — offline for a moment — does not retract a confirmation
    // that still holds; `session.ts`'s own comment on `verifiedSession`
    // explains why leaving it is the safe default here, not clearing it.
    const offlineFetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;
    global.fetch = offlineFetch;
    await storeToken("t");
    await waitFor(() => expect(offlineFetch).toHaveBeenCalled());

    expect(getVerifiedSession()).toEqual({ token: "t", userId: "1" });
  });

  it("clears the verified pair when there is no token left to confirm", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getVerifiedSession()).toBeNull();
  });
});

/**
 * Payload's `/users/me` answers an expired or
 * otherwise invalid JWT with `200 { user: null }`, not a 401
 * (`payload/dist/auth/operations/me.js`), and nothing in this app
 * refreshes a token before its 7200s expiry. A successful answer naming
 * nobody is therefore definitive — the token is dead and is cleared, which
 * notifies every listener exactly as a sign-out does. Only a request that
 * could not get an answer (offline, 429, 5xx) leaves the token in place as
 * "could not verify".
 */
describe("resolveSessionUser, a token /users/me names nobody for", () => {
  let keychain: string | null;

  beforeEach(() => {
    jest.resetAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("1");
    setVerifiedSessionForTests(null);
    keychain = "t";
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(keychain)
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      (_key: string, value: string) => {
        keychain = value;
        return Promise.resolve();
      }
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(() => {
      keychain = null;
      return Promise.resolve();
    });
  });

  it("clears the token and the verified pair on a 200 with no user", async () => {
    // A pair confirmed earlier for this very token, since expired.
    setVerifiedSessionForTests({ token: "t", userId: "1" });
    global.fetch = jest.fn(() =>
      json({ user: null })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(keychain).toBeNull();
    expect(await getToken()).toBeNull();
    expect(getVerifiedSession()).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it.each([
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    ["a 429", () => json({ errors: [{ message: "slow down" }] }, 429)],
    ["a 500", () => json({ errors: [{ message: "boom" }] }, 500)],
    ["a 503", () => json({ errors: [{ message: "down" }] }, 503)],
  ])('keeps the token after %s — that is "could not verify", not a sign-out', async (_label, answer) => {
    global.fetch = jest.fn(answer) as unknown as typeof fetch;

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(keychain).toBe("t");
    expect(result.current.user).toBeNull();
  });

  it("does not clear a newer token stored while the old one's answer was in flight", async () => {
    let answerOld: (response: Response) => void = () => undefined;
    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "JWT t") {
        return new Promise<Response>((resolve) => {
          answerOld = resolve;
        });
      }
      return json({ user: { email: "b@b.test", id: "2", role: "user" } });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Someone signs in while the expired token's check is still out.
    await act(async () => {
      await storeToken("new");
    });
    await waitFor(() => expect(result.current.user?.id).toBe("2"));

    await act(async () => {
      answerOld(
        new Response(JSON.stringify({ user: null }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })
      );
      await Promise.resolve();
    });

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(keychain).toBe("new");
    expect(getVerifiedSession()).toEqual({ token: "new", userId: "2" });
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

describe("changePassword", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("signs this device out once the server confirms the change", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "changed" })
    ) as unknown as typeof fetch;

    await expect(changePassword("old", "a-much-better-one-123")).resolves.toBe(
      "changed"
    );

    // The server already ended every session on its side; this only makes
    // the local state agree.
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("reports a refused current password without signing out", async () => {
    global.fetch = jest.fn(() =>
      json({ field: "credentials", status: "invalid" }, 400)
    ) as unknown as typeof fetch;

    await expect(changePassword("wrong", "a-fine-password-000")).resolves.toBe(
      "credentials"
    );
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("reports a weak new password without signing out", async () => {
    global.fetch = jest.fn(() =>
      json({ field: "password", status: "invalid" }, 400)
    ) as unknown as typeof fetch;

    await expect(changePassword("old", "short")).resolves.toBe("password");
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe("requestEmailChange", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("parks the change and leaves the session untouched", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "pending" })
    ) as unknown as typeof fetch;

    await expect(
      requestEmailChange("pw", "new@example.test", "nl")
    ).resolves.toBe("pending");
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("carries the locale on the query string, for the queued confirmation mail", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "pending" })
    ) as unknown as typeof fetch;

    await requestEmailChange("pw", "new@example.test", "fr");

    const [url] = (global.fetch as unknown as jest.Mock).mock.calls[0];
    expect(new URL(url as string).searchParams.get("locale")).toBe("fr");
  });

  it("reports the refusal the server names", async () => {
    global.fetch = jest.fn(() =>
      json({ field: "email-unchanged", status: "invalid" }, 400)
    ) as unknown as typeof fetch;

    await expect(
      requestEmailChange("pw", "same@example.test", "nl")
    ).resolves.toBe("email-unchanged");
  });
});

describe("deleteAccount", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("signs out locally after a successful delete", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "deleted" })
    ) as unknown as typeof fetch;

    await deleteAccount("a@b.test");

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("does not sign out when the delete is refused", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "invalid" }, 400)
    ) as unknown as typeof fetch;

    await expect(deleteAccount("wrong@b.test")).rejects.toThrow();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("does not sign out when the server fails to delete the account", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "failed" }, 500)
    ) as unknown as typeof fetch;

    await expect(deleteAccount("a@b.test")).rejects.toThrow();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("sends the account's own address, not a password, to the endpoint", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "deleted" })
    ) as unknown as typeof fetch;

    await deleteAccount("a@b.test");

    const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      confirmEmail: "a@b.test",
    });
  });
});
