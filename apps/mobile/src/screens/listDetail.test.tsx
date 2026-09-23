import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { trackEvent } from "@/lib/analytics";
import ListDetailScreen from "../../app/(tabs)/lists/[id]";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock("expo-secure-store");
jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

const LIST = {
  description: null,
  id: 7,
  items: [
    { gesture: { id: 1, name: "Hallo", playbackId: "abc" } },
    { gesture: 42 }, // deactivated: depth: 1 leaves it a bare id
  ],
  name: "Verjaardag",
  visibility: "private",
};

describe("the list detail screen", () => {
  beforeEach(() => {
    // `clearAllMocks`, not `resetAllMocks`: the latter strips the shared
    // `@react-native-async-storage/async-storage` jest mock's own working
    // implementation, which `getToken` (`session.ts`, called on every write
    // below) depends on. `router.back`/`router.push` are module-level mocks
    // shared across every test in this file, so clearing their call history
    // here is what stops one test's press being read as another's.
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "7" });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("shows the list's gestures, by name", async () => {
    global.fetch = jest.fn(() => json(LIST)) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
  });

  /**
   * The opposite rule for a list, not for favourites: the
   * row for a deactivated gesture stays on screen — as
   * `UNAVAILABLE_GESTURE`, with its remove control intact — rather than
   * disappearing, because the owner still has to be able to take it off.
   * `ownedLists.ts`'s own comment on `fetchOwnedList` is what this fixture
   * is built from: a bare-number `gesture` at `depth: 1` is exactly what
   * `publicReadActive` leaves behind for a row it will not populate.
   */
  it("keeps a row for a gesture that no longer resolves, with a remove control", async () => {
    global.fetch = jest.fn(() => json(LIST)) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    await screen.findByText("Hallo");

    expect(screen.getByText(/niet meer beschikbaar/i)).toBeOnTheScreen();
    expect(screen.getByTestId("remove-42")).toBeOnTheScreen();
  });

  it("removes a gesture and refetches the list", async () => {
    // A URL-driven mock rather than a fixed sequence of `mockImplementationOnce`
    // calls: `useList`'s effect and this screen's own render count are not a
    // contract this test should depend on, only what each request actually
    // asks for.
    let current = LIST;

    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === "string" && url.includes("/mobile/lists/remove")) {
        current = { ...LIST, items: [LIST.items[0]] };
        return json({ status: "removed" });
      }

      return json(current);
    }) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    await screen.findByText("Hallo");

    fireEvent.press(screen.getByTestId("remove-42"));

    // A longer timeout than `waitFor`'s default: `FlatList` schedules its
    // own re-render of visible cells through `VirtualizedList`'s internal
    // timeout, on top of the state update this assertion is actually
    // waiting for, and both compete for the clock with whatever else this
    // machine is running.
    await waitFor(() => expect(screen.queryByTestId("remove-42")).toBeNull(), {
      timeout: 10_000,
    });
  }, 15_000);

  it("reports the gesture as removed from the list once the remove succeeds", async () => {
    let current = LIST;

    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === "string" && url.includes("/mobile/lists/remove")) {
        current = { ...LIST, items: [LIST.items[0]] };
        return json({ status: "removed" });
      }

      return json(current);
    }) as unknown as typeof fetch;

    render(<ListDetailScreen />);
    await screen.findByText("Hallo");

    fireEvent.press(screen.getByTestId("remove-42"));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("gesture_collection_changed", {
        action: "removed",
        collection: "list",
        gesture_id: "42",
        source: "gesture_list",
      })
    );
  });

  it("reports nothing when the remove fails", async () => {
    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === "string" && url.includes("/mobile/lists/remove")) {
        return Promise.reject(new TypeError("offline"));
      }

      return json(LIST);
    }) as unknown as typeof fetch;

    render(<ListDetailScreen />);
    await screen.findByText("Hallo");

    fireEvent.press(screen.getByTestId("remove-42"));

    await waitFor(() =>
      expect(screen.getByTestId("remove-42")).toBeOnTheScreen()
    );

    expect(trackEvent).not.toHaveBeenCalledWith(
      "gesture_collection_changed",
      expect.anything()
    );
  });

  it("shows the full-list notice once the cap is reached", async () => {
    const full = {
      ...LIST,
      items: Array.from({ length: 50 }, (_, index) => ({
        gesture: { id: index + 1, name: `Gebaar ${index}`, playbackId: null },
      })),
    };
    global.fetch = jest.fn(() => json(full)) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    expect(await screen.findByTestId("list-full-notice")).toBeOnTheScreen();
  });

  it("deletes the list once the name is confirmed and goes back", async () => {
    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === "string" && url.includes("/mobile/lists/delete")) {
        return json({ status: "deleted" });
      }

      return json(LIST);
    }) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    await screen.findByText("Hallo");

    fireEvent.changeText(
      screen.getByTestId("confirm-delete-name"),
      "Verjaardag"
    );
    fireEvent.press(screen.getByTestId("delete-list"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it("shows an error rather than deleting when the typed name does not match", async () => {
    global.fetch = jest.fn((url: unknown) => {
      if (typeof url === "string" && url.includes("/mobile/lists/delete")) {
        return json({ field: "confirm", status: "invalid" }, 400);
      }

      return json(LIST);
    }) as unknown as typeof fetch;

    render(<ListDetailScreen />);

    await screen.findByText("Hallo");

    fireEvent.changeText(screen.getByTestId("confirm-delete-name"), "Wrong");
    fireEvent.press(screen.getByTestId("delete-list"));

    await waitFor(() =>
      expect(screen.getByTestId("delete-error")).toBeOnTheScreen()
    );
    expect(router.back).not.toHaveBeenCalled();
  });
});
