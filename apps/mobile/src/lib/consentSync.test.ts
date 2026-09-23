import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import {
  loadConsent,
  readConsent,
  resetConsentForTests,
  setConsent,
} from "./consent";
import {
  CONSENT_SYNCED_KEY,
  reconcileConsent,
  useConsentSync,
} from "./consentSync";
import {
  INSTALL_MARKER,
  SessionProvider,
  setVerifiedSessionForTests,
  storeToken,
  useSession,
} from "./session";

jest.mock("expo-secure-store");

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify({ analyticsConsent: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  );
const status = (code: number) =>
  Promise.resolve(
    new Response(JSON.stringify({ error: "x" }), {
      headers: { "Content-Type": "application/json" },
      status: code,
    })
  );

const marker = async () => {
  const raw = await AsyncStorage.getItem(CONSENT_SYNCED_KEY);
  return raw === null ? null : JSON.parse(raw);
};
const consentPosts = () =>
  (global.fetch as unknown as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes("/api/consent")
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  // `session.ts`'s `getToken()` treats a token with no install marker beside
  // it as belonging to a previous install and clears it (see
  // `session.ts:clearStaleInstall`) — a real device concern this suite is
  // not testing, so the marker is pre-seeded the same way `session.test.ts`
  // does for its own token-flow tests, rather than every test here having to
  // account for a reinstall it does not exercise.
  await AsyncStorage.setItem(INSTALL_MARKER, "1");
  resetConsentForTests();
  await loadConsent();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("token");
  // `pass` refuses to POST unless the pass's own `userId` and the
  // keychain's current token both agree with the account and token
  // `/users/me` last confirmed *together* (`session.ts`'s
  // `getVerifiedSession`). None of the tests below that call
  // `reconcileConsent` directly drive a real `resolveSessionUser()` round
  // trip, so that confirmed pairing is set directly, matching the
  // `SecureStore` mock above and the "7" every such test uses — the
  // precondition a real app would already be in by the time
  // `useConsentSync` ever calls `reconcileConsent` for a signed-in user.
  setVerifiedSessionForTests({ token: "token", userId: "7" });
  global.fetch = jest.fn(ok) as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("reconcileConsent", () => {
  it("sends nothing for a guest; the decision stays on the device", async () => {
    await setConsent("granted");
    await reconcileConsent(null);
    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBe("granted");
  });

  it("sends nothing for a signed-in person who has not answered", async () => {
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(0);
  });

  it("records a signed-in decision with the session's own token", async () => {
    await setConsent("granted");
    await reconcileConsent("7");

    const [[url, init]] = consentPosts();
    expect(String(url)).toContain("/api/consent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ analyticsConsent: true });
    expect(new Headers(init.headers).get("Authorization")).toBe("JWT token");
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });

  it("records a refusal as false, not as nothing", async () => {
    await setConsent("denied");
    await reconcileConsent("7");
    expect(JSON.parse(consentPosts()[0][1].body)).toEqual({
      analyticsConsent: false,
    });
  });

  it("does not send the same decision twice", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(1);
  });

  it("sends again when the decision changes", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await setConsent("denied");
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(2);
  });

  it.each([
    429, 500, 503,
  ])("keeps a %s pending and retries on the next pass", async (code) => {
    global.fetch = jest.fn(() => status(code)) as unknown as typeof fetch;
    await setConsent("granted");
    await reconcileConsent("7");
    expect(await marker()).toEqual({
      pending: true,
      userId: "7",
      value: "granted",
    });

    global.fetch = jest.fn(ok) as unknown as typeof fetch;
    await reconcileConsent("7");
    expect(consentPosts()).toHaveLength(1);
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });

  it("keeps an offline attempt pending too", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;
    await setConsent("granted");
    await reconcileConsent("7");
    expect((await marker()).pending).toBe(true);
  });

  it("drops an attributed decision on sign-out, so the next person is asked", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    // A real sign-out: no token left in the keychain at all, not merely a
    // `userId` of `null` (see the unverified-session block below for the
    // case this line exists to keep apart).
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await reconcileConsent(null);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });

  it("drops a pending decision on sign-out as well — the next person must not inherit it", async () => {
    global.fetch = jest.fn(() => status(500)) as unknown as typeof fetch;
    await setConsent("granted");
    await reconcileConsent("7");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await reconcileConsent(null);
    expect(readConsent()).toBeNull();
  });

  it("drops another account's decision rather than filing it under this one", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    (global.fetch as unknown as jest.Mock).mockClear();

    await reconcileConsent("8");

    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });

  it("serialises passes: two at once send one request", async () => {
    await setConsent("granted");
    await Promise.all([reconcileConsent("7"), reconcileConsent("7")]);
    expect(consentPosts()).toHaveLength(1);
  });

  /**
   * The subscription loop: `dropForeignDecision` calls
   * `clearConsent`, which notifies `subscribeConsent`'s listeners, which
   * (through `useConsentSync`) queues another `reconcileConsent` pass. That
   * pass finds no marker and no consent left to act on, so it must return
   * without posting or clearing anything a second time — proven here at the
   * `reconcileConsent` level directly, by driving the same sequence a
   * subscriber-triggered re-entry would and checking it settles rather than
   * growing the request count.
   */
  it("settles after a sign-out clears a foreign marker, rather than looping", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    (global.fetch as unknown as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await reconcileConsent(null);
    // A second, "re-entrant" pass — standing in for the one the consent
    // store's own subscriber notification would trigger — must be a no-op.
    await reconcileConsent(null);

    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });
});

/**
 * A session that could not be verified — a stored
 * token, but no answer from `/users/me` (offline, 429, 5xx) — must not be
 * treated the same as a genuine sign-out. (An *answer* naming no user is an
 * expired token, which `session.ts` now clears; see the `useConsentSync`
 * test for that case.) `pass` now tells the two apart with `getToken()`
 * itself, since `useConsentSync` reports both cases identically
 * (`userId === null`).
 */
describe("reconcileConsent, an unverified session", () => {
  it("keeps a confirmed decision when the session could not be verified, rather than treating it as signed out", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    (global.fetch as unknown as jest.Mock).mockClear();

    // The token is still in the keychain — this is "could not verify",
    // not "signed out" — see the sign-out tests above for the case where
    // it genuinely is absent.
    await reconcileConsent(null);

    expect(readConsent()).toBe("granted");
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
    expect(consentPosts()).toHaveLength(0);
  });

  it("keeps a pending decision when the session could not be verified, and still retries it once verified again", async () => {
    global.fetch = jest.fn(() => status(500)) as unknown as typeof fetch;
    await setConsent("granted");
    await reconcileConsent("7");
    expect((await marker()).pending).toBe(true);
    (global.fetch as unknown as jest.Mock).mockClear();

    await reconcileConsent(null);

    expect(await marker()).toEqual({
      pending: true,
      userId: "7",
      value: "granted",
    });
    expect(consentPosts()).toHaveLength(0);

    // The session is verified again (a foreground pass, say); the pending
    // decision is still there to retry.
    global.fetch = jest.fn(ok) as unknown as typeof fetch;
    await reconcileConsent("7");

    expect(consentPosts()).toHaveLength(1);
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });
});

/**
 * A pass carries the
 * `userId` it was enqueued for, but by the time it actually runs the
 * keychain can already hold another account's token — `SessionProvider`
 * does not re-verify the instant a token changes. `pass` refuses to POST
 * unless `session.ts`'s `getVerifiedSession()` names both the account this
 * pass carries and the token currently in the keychain, and it sends
 * exactly that verified token rather than letting `payloadFetch` re-read
 * the keychain for its own.
 *
 * There are two kinds of test here rather than one: the first two isolate each
 * half of that comparison directly (an internal-consistency check, using
 * `setVerifiedSessionForTests` to construct states that are simple to state
 * precisely); the third reproduces the actual account-switch race end to end,
 * through a real `SessionProvider`, without injecting any state production
 * can't reach. An earlier version of this block did inject one
 * (`setVerifiedTokenForTests("tA")` was never a value a real resolve could have
 * produced at that point), which is why it passed without actually closing the
 * race it was named for.
 */
describe("reconcileConsent, a token the session has moved on from", () => {
  it("sends the account's decision under the exact token the session was verified with", async () => {
    await setConsent("granted");

    await reconcileConsent("7");

    const [[, init]] = consentPosts();
    expect(new Headers(init.headers).get("Authorization")).toBe("JWT token");
  });

  it("does not POST when the keychain now holds a different token than the one this session verified", async () => {
    setVerifiedSessionForTests({ token: "tA", userId: "7" });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tB");
    await AsyncStorage.setItem(
      CONSENT_SYNCED_KEY,
      JSON.stringify({ pending: true, userId: "7", value: "granted" })
    );
    await setConsent("granted");

    await reconcileConsent("7");

    expect(consentPosts()).toHaveLength(0);
    expect(await marker()).toEqual({
      pending: true,
      userId: "7",
      value: "granted",
    });
  });

  it("does not POST when the verified session names a different account than this pass, even if the token still matches", async () => {
    // The token hasn't changed, but the confirmed pairing names a
    // different account than the one this pass carries — an internal
    // inconsistency `pass` refuses to paper over by trusting the token
    // match alone.
    setVerifiedSessionForTests({ token: "token", userId: "7" });
    await AsyncStorage.setItem(
      CONSENT_SYNCED_KEY,
      JSON.stringify({ pending: true, userId: "9", value: "granted" })
    );
    await setConsent("granted");

    await reconcileConsent("9");

    expect(consentPosts()).toHaveLength(0);
    expect(await marker()).toEqual({
      pending: true,
      userId: "9",
      value: "granted",
    });
  });

  it("sends exactly the verified token, not a fresh keychain read, even if the keychain has since moved on again", async () => {
    // Simulates the check/use gap directly: `pass`'s own gate check reads
    // the keychain once (sees "tA", matching the verified pairing) — a
    // second, later keychain read (what `payloadFetch`'s own `auth: true`
    // would have done) would see "tC" instead. The POST must still carry
    // "tA": the token `pass` already confirmed, not whatever the keychain
    // says by the time the request itself goes out.
    setVerifiedSessionForTests({ token: "tA", userId: "7" });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce("tA")
      .mockResolvedValue("tC");
    await setConsent("granted");

    await reconcileConsent("7");

    const [[, init]] = consentPosts();
    expect(new Headers(init.headers).get("Authorization")).toBe("JWT tA");
  });

  /**
   * The actual race, reproduced through a real `SessionProvider`: account
   * A is genuinely verified (a real `/users/me` answering A's id, against
   * "tA"), then the keychain is handed B's token while B's own
   * `/users/me` is still in flight. `getVerifiedSession()` still names A
   * during that whole window — this is `session.ts`'s own fix-round-2
   * correction at work, not anything this test sets up directly — so a
   * pass enqueued for A while the tree still rendered A (exactly what
   * `useConsentSync`'s own closure would have done) must not send A's
   * decision under B's token. Once B's `/users/me` finally answers, the
   * next pass (for B) finds A's marker foreign and drops it — never
   * having POSTed it under anyone's token at all.
   */
  it("never sends an outgoing account's decision under an incoming account's token, across a real account switch", async () => {
    const meAs = (id: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ user: { email: `${id}@b.test`, id, role: "user" } }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        )
      );

    // A is genuinely verified against "tA".
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tA");
    global.fetch = jest.fn((url: string) =>
      String(url).includes("/users/me") ? meAs("7") : ok()
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.user?.id).toBe("7"));

    // A's decision, still pending from an earlier failed POST.
    await setConsent("granted");
    await AsyncStorage.setItem(
      CONSENT_SYNCED_KEY,
      JSON.stringify({ pending: true, userId: "7", value: "granted" })
    );

    // The keychain now holds B's token, and B's own resolve is started
    // (via `storeToken`, exactly as a real sign-in would) but never
    // answers here — the real window: `getVerifiedSession()` still names
    // A, `getToken()` already names B.
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tB");
    let resolveUsersMeForB: (response: Response) => void = () => undefined;
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes("/users/me")) {
        return new Promise<Response>((resolve) => {
          resolveUsersMeForB = resolve;
        });
      }
      return ok();
    }) as unknown as typeof fetch;
    await storeToken("tB");

    // A pass enqueued for A — standing in for what `useConsentSync`'s own
    // closure, still holding A's id, would have queued during this
    // window — must not POST.
    await reconcileConsent("7");

    expect(consentPosts()).toHaveLength(0);
    expect(await marker()).toEqual({
      pending: true,
      userId: "7",
      value: "granted",
    });

    // Now B's own resolution lands.
    resolveUsersMeForB(
      new Response(
        JSON.stringify({ user: { email: "b@b.test", id: "8", role: "user" } }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    );
    await waitFor(() => expect(result.current.user?.id).toBe("8"));

    // A pass for B — standing in for the one `useConsentSync` runs once
    // its own `userId` catches up — drops A's marker as foreign, having
    // never sent a consent POST under B's token for A's decision.
    await reconcileConsent("8");

    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
    expect(consentPosts()).toHaveLength(0);
  });

  it("aborts a stalled consent POST after 15s, leaving it pending for the next pass to retry", async () => {
    jest.useFakeTimers();
    try {
      // A real `fetch` rejects when its `AbortSignal` fires; this stands in
      // for one that would otherwise hang forever.
      global.fetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      ) as unknown as typeof fetch;
      await setConsent("granted");

      const pending = reconcileConsent("7");
      // Let the pass run up to the point it has registered the abort
      // timer (a handful of awaited `AsyncStorage` round trips) before
      // fast-forwarding fake time past it.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(15_000);
      await pending;

      expect((await marker()).pending).toBe(true);

      global.fetch = jest.fn(ok) as unknown as typeof fetch;
      await reconcileConsent("7");

      expect(await marker()).toEqual({ userId: "7", value: "granted" });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * `useConsentSync`, mounted through a real `SessionProvider` (as
 * `app/_layout.tsx` does) rather than a mocked `useSession` — the same
 * pattern `src/screens/settings.test.tsx` uses. `/users/me` is the first
 * `fetch` call in every case here; `/api/consent` calls are everything
 * after, so branching the mock on the URL keeps the two apart.
 */
describe("useConsentSync", () => {
  const me = (id: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify({ user: { email: "a@b.test", id, role: "user" } }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    );

  it("does nothing while the session is still loading", async () => {
    // Seeded with a confirmed marker + matching consent: the original
    // version of this test seeded neither, so it stayed green with the
    // `if (loading) { return; }` guard deleted outright — nothing was ever
    // at stake for it to protect. `AsyncStorage.getItem` is spied on
    // directly (rather than only checking the outcome) because a *later*
    // guard inside `pass` itself (a stored token with no resolved user is
    // not treated as signed out) would otherwise
    // leave this decision looking untouched even with the loading guard
    // gone — reading `CONSENT_SYNCED_KEY` at all is `readMarker`'s doing,
    // the first thing any pass touches, so it is true regardless of what a
    // pass then decides to do with what it read.
    global.fetch = jest.fn(
      () => new Promise(() => undefined)
    ) as unknown as typeof fetch; // /users/me never resolves, so `loading` never turns false.
    await setConsent("granted");
    await AsyncStorage.setItem(
      CONSENT_SYNCED_KEY,
      JSON.stringify({ userId: "7", value: "granted" })
    );
    // `AsyncStorage.getItem` is one `jest.fn()` shared for the whole file
    // (the package's own jest mock, not something `jest.spyOn` freshly
    // wraps here), so its call history is cleared first — otherwise every
    // earlier test's reads of this same key would already satisfy the
    // `.some(...)` check below before this test has done anything at all.
    const getItem = jest.spyOn(AsyncStorage, "getItem");
    getItem.mockClear();

    renderHook(() => useConsentSync(), { wrapper: SessionProvider });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getItem.mock.calls.some(([key]) => key === CONSENT_SYNCED_KEY)).toBe(
      false
    );
    expect(consentPosts()).toHaveLength(0);
    expect(readConsent()).toBe("granted");
    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });

  it("drops the decision and its marker when the session has expired", async () => {
    // Payload answers an expired JWT with `200 { user: null }`, not a 401
    // (`payload/dist/auth/operations/me.js`). `session.ts` now treats that
    // as a sign-out and clears the token, so this pass sees no token and
    // drops the account's decision — rather than reading the dead token
    // as "could not verify" and keeping it on a signed-out device forever.
    let keychain: string | null = "token";
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(keychain)
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(() => {
      keychain = null;
      return Promise.resolve();
    });
    global.fetch = jest.fn((url: string) =>
      String(url).includes("/users/me")
        ? Promise.resolve(
            new Response(JSON.stringify({ user: null }), {
              headers: { "Content-Type": "application/json" },
              status: 200,
            })
          )
        : ok()
    ) as unknown as typeof fetch;
    await setConsent("granted");
    await AsyncStorage.setItem(
      CONSENT_SYNCED_KEY,
      JSON.stringify({ userId: "7", value: "granted" })
    );

    renderHook(() => useConsentSync(), { wrapper: SessionProvider });

    await waitFor(() => expect(readConsent()).toBeNull());
    expect(await marker()).toBeNull();
    expect(keychain).toBeNull();
    expect(consentPosts()).toHaveLength(0);
  });

  it("logs a pass that fails, rather than leaving its rejection unhandled", async () => {
    // The keychain starts failing once `/users/me` has answered, so the
    // session resolves normally and the pass's own `getToken()` is what
    // throws — the one read in `pass` nothing inside it catches.
    let keychainBroken = false;
    const keychainError = new Error("keychain unavailable");
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(() =>
      keychainBroken ? Promise.reject(keychainError) : Promise.resolve("token")
    );
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes("/users/me")) {
        keychainBroken = true;
        return me("7");
      }
      return ok();
    }) as unknown as typeof fetch;
    await setConsent("granted");

    renderHook(() => useConsentSync(), { wrapper: SessionProvider });

    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        "[consentSync] Failed to reconcile consent:",
        keychainError
      )
    );
    expect(consentPosts()).toHaveLength(0);
  });

  it("retries a pending decision when the app returns to the foreground", async () => {
    let consentAnswer: () => Promise<Response> = () => status(500);
    global.fetch = jest.fn((url: string) =>
      String(url).includes("/users/me") ? me("7") : consentAnswer()
    ) as unknown as typeof fetch;
    await setConsent("granted");

    // Captured directly rather than read back out of `mock.calls`: the
    // real `AppState` module (jest-expo's react-native mock) registers its
    // own internal "change" listeners as a side effect of rendering, so
    // `addEventListener.mock.calls` holds more entries than just this
    // hook's — searching them for "the" change handler is not reliable.
    // Overwriting on every "change" registration and using whichever one
    // is current after the hook's own effect has committed sidesteps that.
    let onChange: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((type, handler) => {
        if (type === "change") {
          onChange = handler as (state: string) => void;
        }
        return { remove: jest.fn() } as ReturnType<
          typeof AppState.addEventListener
        >;
      });

    renderHook(() => useConsentSync(), { wrapper: SessionProvider });

    await waitFor(() => expect(consentPosts()).toHaveLength(1));
    expect((await marker()).pending).toBe(true);
    expect(onChange).toBeDefined();

    consentAnswer = ok;
    await act(async () => {
      (onChange as (state: string) => void)("active");
    });
    await waitFor(() => expect(consentPosts()).toHaveLength(2));

    expect(await marker()).toEqual({ userId: "7", value: "granted" });
  });
});
