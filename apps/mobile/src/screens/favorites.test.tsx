import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { SessionProvider } from "@/lib/session";
import FavoritesScreen from "../../app/(tabs)/favorites";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("expo-secure-store");

const ACTIVE = { categories: [], id: "1", name: "Hallo", playbackId: "abc" };

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

function renderScreen() {
  return render(<FavoritesScreen />, { wrapper: SessionProvider });
}

describe("the favorites screen", () => {
  beforeEach(async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await AsyncStorage.clear();
  });

  it("says favourites stay on this device when signed out", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], totalDocs: 0 })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByTestId("favorites-scope")).toHaveTextContent(
      /dit toestel/i
    );

    // The scope text renders immediately and does not itself wait on
    // `useFavorites`/`useFavoriteGestures`'s own async loads — let those
    // settle under `act` here too (both resolve to an empty list), rather
    // than leaving them to update state during whatever test runs next.
    await screen.findByText(/nog geen favorieten/i);
  });

  it("shows an empty state before anything is favourited", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], totalDocs: 0 })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(/nog geen favorieten/i)).toBeOnTheScreen();
  });

  /**
   * Review Focus item 5, exercised at the full screen rather than only at
   * the hook: `AsyncStorage` holds two guest-favourited ids, one of them a
   * gesture `GET /api/gestures` no longer returns (deactivated, per
   * `publicReadActive`), and the screen must render the one gesture that did
   * resolve — never a blank row, and never the word "undefined", which is
   * what `gesture.name` prints when a screen indexes into a result that
   * never arrived.
   */
  it("renders the favourite that still resolves and never a blank or 'undefined' row for the one that does not", async () => {
    await AsyncStorage.setItem(
      "smog.guest.favorites",
      JSON.stringify([ACTIVE.id, "deactivated"])
    );

    global.fetch = jest.fn(() =>
      json({ docs: [ACTIVE], totalDocs: 1 })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(ACTIVE.name)).toBeOnTheScreen();
    expect(screen.queryByText("undefined")).toBeNull();
  });

  it("shows an error state when the gestures cannot be loaded", async () => {
    await AsyncStorage.setItem(
      "smog.guest.favorites",
      JSON.stringify([ACTIVE.id])
    );

    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("favorites-error")).toBeOnTheScreen()
    );
  });
});
