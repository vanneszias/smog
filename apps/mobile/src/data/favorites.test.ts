import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { MAX_GUEST_FAVORITES } from "@/lib/guest";
import { SessionProvider } from "@/lib/session";
import {
  MAX_RESOLVED_FAVORITES,
  useFavoriteGestures,
  useFavorites,
} from "./favorites";

jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

const ACTIVE = { categories: [], id: "1", name: "Hallo", playbackId: "abc" };

/**
 * A private in-memory `AsyncStorage`, reinstalled per test. See
 * `session.test.ts`'s identical note: the shared jest mock's own default
 * implementation does not survive `resetAllMocks()` once anything in this
 * process has called it, and this app's `INSTALL_MARKER` check
 * (`session.ts`'s `clearStaleInstall`) reads `AsyncStorage` on every
 * `getToken()` call, which every signed-in test here makes indirectly.
 */
let store: Record<string, string>;

// `session.ts`'s own `INSTALL_MARKER`, duplicated as a literal rather than
// imported — a stable, documented key. `session.ts` is not mocked in this
// file: `useFavorites` is exercised through a real `SessionProvider`, so a
// signed-in test has to satisfy the real reinstall check the same way a
// genuine app launch would.
const INSTALL_MARKER_KEY = "smog.install";

function installedWithToken(): void {
  store[INSTALL_MARKER_KEY] = "1";
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
}

describe("useFavorites", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(store[key] ?? null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      delete store[key];
      return Promise.resolve();
    });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  describe("signed out", () => {
    it("reads the device's guest favourites", async () => {
      store["smog.guest.favorites"] = JSON.stringify(["a", "b"]);

      const { result } = renderHook(() => useFavorites(), {
        wrapper: SessionProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.signedIn).toBe(false);
      expect(result.current.ids).toEqual(["a", "b"]);
    });

    it("toggles a favourite on the device rather than the network", async () => {
      global.fetch = jest.fn() as unknown as typeof fetch;

      const { result } = renderHook(() => useFavorites(), {
        wrapper: SessionProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.toggle("a");
      });

      await waitFor(() => expect(result.current.ids).toEqual(["a"]));
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("signed in", () => {
    it("reads the account's favourites from /users/me", async () => {
      installedWithToken();

      global.fetch = jest
        .fn()
        .mockImplementationOnce(() =>
          json({ user: { email: "a@b.test", id: "1", role: "user" } })
        ) // SessionProvider's own /users/me
        .mockImplementationOnce(() =>
          json({ user: { favorites: [1, 2] } })
        ) as unknown as typeof fetch; // useFavorites' /users/me?depth=0

      const { result } = renderHook(() => useFavorites(), {
        wrapper: SessionProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.signedIn).toBe(true);
      expect(result.current.ids).toEqual(["1", "2"]);
    });

    it("toggles a favourite through POST /account/favorites, not the device", async () => {
      installedWithToken();

      global.fetch = jest
        .fn()
        .mockImplementationOnce(() =>
          json({ user: { email: "a@b.test", id: "1", role: "user" } })
        )
        .mockImplementationOnce(() => json({ user: { favorites: [] } }))
        .mockImplementationOnce(() =>
          json({ favorite: true })
        ) as unknown as typeof fetch;

      const { result } = renderHook(() => useFavorites(), {
        wrapper: SessionProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.toggle("7");
      });

      await waitFor(() => expect(result.current.ids).toEqual(["7"]));

      const calls = (global.fetch as unknown as jest.Mock).mock.calls;
      const [url, init] = calls.at(-1) as [string, RequestInit];

      expect(url).toContain("/account/favorites");
      expect(init.body).toBe(
        JSON.stringify({ favorite: true, gestureId: "7" })
      );
      expect(store["smog.guest.favorites"]).toBeUndefined();
    });
  });
});

describe("useFavoriteGestures", () => {
  // `clearAllMocks`, not `resetAllMocks`: the latter strips
  // `expo-localization`'s own default mock implementation the same way it
  // strips `AsyncStorage`'s (see the note above `useFavorites`'s describe
  // block), and `currentLocale()` calls it on every request this hook makes.
  beforeEach(() => jest.clearAllMocks());

  it("renders the gestures that resolved and drops an id that no longer does", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [ACTIVE], totalDocs: 1 })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useFavoriteGestures([ACTIVE.id, "deactivated"])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([ACTIVE]);
  });

  it("asks for exactly the requested ids, filtered to active gestures", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [ACTIVE], totalDocs: 1 })
    ) as unknown as typeof fetch;

    renderHook(() => useFavoriteGestures([ACTIVE.id, "deactivated"]));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [url] = (global.fetch as unknown as jest.Mock).mock.calls[0];

    expect(url).toContain(`where%5Bid%5D%5Bin%5D=${ACTIVE.id}%2Cdeactivated`);
    expect(url).toContain("where%5BisActive%5D%5Bequals%5D=true");
  });

  it("resolves to an empty list rather than requesting anything for no ids", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    const { result } = renderHook(() => useFavoriteGestures([]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("turns a rejected request into an error rather than throwing", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useFavoriteGestures(["1"]));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toEqual([]);
  });
});

describe("MAX_RESOLVED_FAVORITES", () => {
  it("is lib/guest.ts's own MAX_GUEST_FAVORITES, not an independent number", () => {
    // Fix round 1, Minor 4: this was a second `= 200` literal, free to
    // drift from `lib/guest.ts`'s. It is a re-export now (see this
    // constant's own doc comment), so this pins the re-export itself
    // rather than two numbers that merely happen to match today.
    expect(MAX_RESOLVED_FAVORITES).toBe(MAX_GUEST_FAVORITES);
  });
});
