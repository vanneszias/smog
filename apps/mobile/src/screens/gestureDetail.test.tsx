import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { trackEvent } from "@/lib/analytics";
import { SessionProvider } from "@/lib/session";
import { emitOnLastPlayer } from "@/test/expoVideoMock";
import GestureDetailScreen from "../../app/gestures/[id]";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
  trackScreenView: jest.fn(),
}));

/**
 * Task 11 wired `useFavorites` (and so `useSession`) into this screen, which
 * needs a `SessionProvider` above it and, transitively, `expo-secure-store`.
 * See `screens/gestures.test.tsx`'s identical note on why the mock is set to
 * resolve `null` rather than left on its bare automock.
 */
jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

function renderScreen() {
  return render(<GestureDetailScreen />, { wrapper: SessionProvider });
}

describe("the gesture detail screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "7" });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("shows a loading state before the first response", async () => {
    global.fetch = jest.fn(
      () => new Promise(() => undefined)
    ) as unknown as typeof fetch;

    renderScreen();

    expect(screen.getByLabelText(/gebaar laden/i)).toBeOnTheScreen();

    // The gesture fetch above never resolves — that is the point of this
    // test — but this screen also mounts `SessionProvider` and its own
    // `useFavorites`, both of which resolve quickly against the mocked
    // `SecureStore`/`AsyncStorage`. Flush that pending work under `act`
    // here, rather than leaving it to update state during whatever test
    // runs next.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("shows the gesture's name once it arrives", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.queryByLabelText(/gebaar laden/i)).toBeNull();
  });

  it("renders the labelled placeholder for a gesture with no video, not an error", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: null })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.getByText(/video niet beschikbaar/i)).toBeOnTheScreen();
    expect(screen.queryByText(/probeer opnieuw/i)).toBeNull();
  });

  it("shows an error with a retry when the request fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(/probeer opnieuw/i)).toBeOnTheScreen();
  });

  it("retries when the retry control is pressed", async () => {
    const fetchMock = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("offline"))
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /probeer opnieuw/i })
    );

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
  });

  it("goes back when the back control is pressed", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    renderScreen();
    await screen.findByText("Hallo");

    fireEvent.press(screen.getByTestId("back"));

    expect(router.back).toHaveBeenCalled();
  });

  it("reports the gesture as viewed once it has loaded, and not again on re-render", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    const { rerender } = renderScreen();
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledWith("gesture_viewed", {
      gesture_id: "7",
      source: "direct",
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);

    rerender(<GestureDetailScreen />);
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("reports playback completion when the video ends", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    renderScreen();
    await screen.findByText("Hallo");
    (trackEvent as jest.Mock).mockClear();

    emitOnLastPlayer("playToEnd");

    expect(trackEvent).toHaveBeenCalledWith("video_playback_completed", {
      gesture_id: "7",
    });
  });
});

const GESTURE = { categories: [], id: 7, name: "Hallo", playbackId: "abc" };
const SESSION_USER = { email: "a@b.test", id: "1", role: "user" };

/**
 * A URL-routed mock rather than a fixed call sequence: this screen makes an
 * unpredictable number of requests before the sheet ever opens (the
 * session, the gesture, `useFavorites`' own read), and a positional
 * `mockImplementationOnce` chain would be pinning render order this test
 * has no business depending on.
 */
function routedFetch(lists: unknown[], addResult: () => Promise<Response>) {
  return jest.fn((url: unknown) => {
    if (typeof url !== "string") {
      return json({});
    }

    if (url.includes("/mobile/lists/add")) {
      return addResult();
    }

    if (url.includes("/lists?")) {
      return json({ docs: lists });
    }

    if (url.includes("/gestures/7")) {
      return json(GESTURE);
    }

    if (url.includes("/users/me?depth=0")) {
      return json({ user: { favorites: [] } });
    }

    if (url.includes("/users/me")) {
      return json({ user: SESSION_USER });
    }

    return json({});
  }) as unknown as typeof fetch;
}

describe("the add-to-list sheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "7" });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("opens from the gesture detail screen and lists the account's lists", async () => {
    global.fetch = routedFetch(
      [{ id: 1, items: [], name: "Verjaardag", visibility: "private" }],
      () => json({ status: "added" })
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));

    expect(await screen.findByText("Verjaardag")).toBeOnTheScreen();
  });

  it("adds the gesture and shows that it was added", async () => {
    global.fetch = routedFetch(
      [{ id: 1, items: [], name: "Verjaardag", visibility: "private" }],
      () => json({ status: "added" })
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));
    await screen.findByText("Verjaardag");

    fireEvent.press(screen.getByTestId("add-to-list-1"));

    await waitFor(() =>
      expect(screen.getByTestId("add-to-list-1-status")).toHaveTextContent(
        "Toegevoegd"
      )
    );
  });

  /**
   * The brief's own requirement: "the app shows the limit before the
   * request." A list already at `MAX_LIST_ITEMS` is shown as full — and its
   * row disabled — from the moment the sheet opens, not only after a tap
   * the server then refuses.
   */
  it("shows a list at the cap as full, disabled, before any tap", async () => {
    const fullList = {
      id: 1,
      items: Array.from({ length: 50 }, (_, index) => ({ gesture: index })),
      name: "Vol",
      visibility: "private" as const,
    };
    global.fetch = routedFetch([fullList], () =>
      json({ field: "full", status: "invalid" }, 409)
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));
    await screen.findByText("Vol");

    expect(screen.getByTestId("add-to-list-1-status")).toHaveTextContent(
      /vol/i
    );

    fireEvent.press(screen.getByTestId("add-to-list-1"));

    // Disabled: no request went out for a press this screen already knew
    // would be refused.
    expect(
      (global.fetch as unknown as jest.Mock).mock.calls.some(([url]) =>
        String(url).includes("/mobile/lists/add")
      )
    ).toBe(false);
  });

  /**
   * Review Focus / Fix round 1, item 2: `handleAdd` had no `catch`, so a
   * refusal became an unhandled rejection and the row silently did nothing.
   * This is the test that would have failed against that version.
   */
  it("shows that the add failed, rather than doing nothing silently", async () => {
    global.fetch = routedFetch(
      [{ id: 1, items: [], name: "Verjaardag", visibility: "private" }],
      () => Promise.reject(new TypeError("offline"))
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));
    await screen.findByText("Verjaardag");

    fireEvent.press(screen.getByTestId("add-to-list-1"));

    await waitFor(() =>
      expect(screen.getByTestId("add-to-list-1-status")).toHaveTextContent(
        "Niet gelukt"
      )
    );
  });

  it("tells the reader there are no lists yet, rather than an empty sheet", async () => {
    global.fetch = routedFetch([], () => json({ status: "added" }));

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));

    expect(await screen.findByTestId("no-lists")).toBeOnTheScreen();
  });

  it("reports the gesture as added to the list once the add succeeds", async () => {
    global.fetch = routedFetch(
      [{ id: 1, items: [], name: "Verjaardag", visibility: "private" }],
      () => json({ status: "added" })
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));
    await screen.findByText("Verjaardag");

    fireEvent.press(screen.getByTestId("add-to-list-1"));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("gesture_collection_changed", {
        action: "added",
        collection: "list",
        gesture_id: "7",
        source: "gesture_detail",
      })
    );
  });

  it("reports nothing when the add fails", async () => {
    global.fetch = routedFetch(
      [{ id: 1, items: [], name: "Verjaardag", visibility: "private" }],
      () => Promise.reject(new TypeError("offline"))
    );

    renderScreen();
    fireEvent.press(await screen.findByTestId("open-add-to-list"));
    await screen.findByText("Verjaardag");

    fireEvent.press(screen.getByTestId("add-to-list-1"));

    await waitFor(() =>
      expect(screen.getByTestId("add-to-list-1-status")).toHaveTextContent(
        "Niet gelukt"
      )
    );

    expect(trackEvent).not.toHaveBeenCalledWith(
      "gesture_collection_changed",
      expect.anything()
    );
  });
});
