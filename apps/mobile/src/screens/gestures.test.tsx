import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { SessionProvider } from "@/lib/session";
import GesturesScreen from "../../app/(tabs)/index";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts` and `src/screens/signUp.test.tsx`'s own note on
 * why.
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

/**
 * `expo-secure-store` mocked, and set to answer "no token" rather than left
 * on its bare automock: `SessionProvider` — needed here because this screen
 * reads `useFavorites` (and so `useSession`) — resolves `token`
 * with `token === null` as its literal "signed out" check. An unconfigured
 * automock answers `undefined`, which fails that check and would make the
 * provider issue a `/users/me` request this file's fetch mocks do not
 * account for.
 */
jest.mock("expo-secure-store");

const PAGE = {
  docs: [{ categories: [], id: "1", name: "Hallo", playbackId: "abc" }],
  page: 1,
  totalDocs: 1,
  totalPages: 1,
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

function renderScreen() {
  return render(<GesturesScreen />, { wrapper: SessionProvider });
}

describe("the gestures screen", () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("shows a loading state before the first response", async () => {
    global.fetch = jest.fn(
      () => new Promise(() => undefined)
    ) as unknown as typeof fetch;

    renderScreen();

    expect(screen.getByLabelText(/gebaren laden/i)).toBeOnTheScreen();

    // The gestures fetch above never resolves — that is the point of this
    // test — but this screen also mounts `SessionProvider` and its own
    // `useFavorites`, both of which resolve quickly against the mocked
    // `SecureStore`. Flush that pending work under `act` here, rather than
    // leaving it to update state during whatever test runs next.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("shows the gestures once they arrive", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
  });

  it("does not show the loading state once loaded", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;

    renderScreen();

    // Proves the screen actually rendered this far before checking an
    // absence: an absence assertion passes just as happily on a screen that
    // never got this far.
    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.queryByLabelText(/gebaren laden/i)).toBeNull();
  });

  it("shows an error with a retry when the request fails", async () => {
    const fetchMock = jest.fn(() => json(PAGE));
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("Network request failed"))
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(/probeer opnieuw/i)).toBeOnTheScreen();
  });

  it("retries when the retry control is pressed", async () => {
    const fetchMock = jest.fn(() => json(PAGE));
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

  it("shows an empty state, not an error, for a successful empty result", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], page: 1, totalDocs: 0, totalPages: 1 })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(/geen gebaren gevonden/i)).toBeOnTheScreen();
    expect(screen.queryByText(/probeer opnieuw/i)).toBeNull();
  });

  it("opens the category filter sheet from the filter button", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [{ id: "3", name: "Groeten" }] })
    ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.press(await screen.findByTestId("open-filter"));

    expect(await screen.findByTestId("category-filter-3")).toBeOnTheScreen();
  });

  it("requests the next page when the list is scrolled to the end", async () => {
    const first = {
      docs: [{ categories: [], id: "1", name: "Een", playbackId: null }],
      page: 1,
      totalDocs: 2,
      totalPages: 2,
    };
    const second = {
      docs: [{ categories: [], id: "2", name: "Twee", playbackId: null }],
      page: 2,
      totalDocs: 2,
      totalPages: 2,
    };
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => json(first))
      .mockImplementationOnce(() => json({ docs: [] }))
      .mockImplementationOnce(() => json(second));
    global.fetch = fetchMock as unknown as typeof fetch;

    renderScreen();

    const list = await screen.findByText("Een");

    expect(list).toBeOnTheScreen();

    fireEvent(screen.getByTestId("gestures-list"), "onEndReached");

    await waitFor(() => expect(screen.getByText("Twee")).toBeOnTheScreen());
    // The first page's own gesture is still there — this is
    // accumulation, not replacement.
    expect(screen.getByText("Een")).toBeOnTheScreen();
  });
});
