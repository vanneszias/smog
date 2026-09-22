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
import { INSTALL_MARKER, SessionProvider } from "./session";

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
  ])("keeps a %s pending and retries on the next pass (Review Focus 5)", async (code) => {
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

  it("drops an attributed decision on sign-out, so the next person is asked (Review Focus 3)", async () => {
    await setConsent("granted");
    await reconcileConsent("7");
    await reconcileConsent(null);
    expect(readConsent()).toBeNull();
    expect(await marker()).toBeNull();
  });

  it("drops a pending decision on sign-out as well — the next person must not inherit it", async () => {
    global.fetch = jest.fn(() => status(500)) as unknown as typeof fetch;
    await setConsent("granted");
    await reconcileConsent("7");
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

  it("serialises passes: two at once send one request (Review Focus 1)", async () => {
    await setConsent("granted");
    await Promise.all([reconcileConsent("7"), reconcileConsent("7")]);
    expect(consentPosts()).toHaveLength(1);
  });

  /**
   * The subscription loop the brief calls out: `dropForeignDecision` calls
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
    // /users/me never resolves, so `loading` never turns false.
    global.fetch = jest.fn(
      () => new Promise(() => undefined)
    ) as unknown as typeof fetch;
    await setConsent("granted");

    renderHook(() => useConsentSync(), { wrapper: SessionProvider });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consentPosts()).toHaveLength(0);
  });

  it("retries a pending decision when the app returns to the foreground (Review Focus 5)", async () => {
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
