import { fireEvent, render, screen } from "@testing-library/react-native";
import { trackEvent } from "@/lib/analytics";
import SearchScreen from "../../app/(tabs)/search";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
  trackScreenView: jest.fn(),
}));

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

const type = (query: string) => {
  fireEvent.changeText(screen.getByLabelText("Zoeken"), query);
  fireEvent(screen.getByLabelText("Zoeken"), "submitEditing");
};

describe("the search screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prompts for a query and fetches nothing before anything is typed", () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;

    render(<SearchScreen />);

    expect(screen.getByText(/typ om een gebaar te zoeken/i)).toBeOnTheScreen();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the matching gestures once a query is submitted", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("hal");

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.queryByText(/typ om een gebaar te zoeken/i)).toBeNull();
  });

  it("shows an empty state, not an error, for a query that matches nothing", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], page: 1, totalDocs: 0, totalPages: 1 })
    ) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("zzzzzz");

    expect(await screen.findByText(/geen gebaren gevonden/i)).toBeOnTheScreen();
    expect(screen.queryByText(/probeer opnieuw/i)).toBeNull();
  });

  it("shows an error with a retry when the search request fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("hal");

    expect(await screen.findByText(/probeer opnieuw/i)).toBeOnTheScreen();
  });

  it("goes back to the prompt when the query is cleared", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("hal");
    await screen.findByText("Hallo");

    fireEvent.changeText(screen.getByLabelText("Zoeken"), "");
    fireEvent(screen.getByLabelText("Zoeken"), "submitEditing");

    expect(
      await screen.findByText(/typ om een gebaar te zoeken/i)
    ).toBeOnTheScreen();
    expect(screen.queryByText("Hallo")).toBeNull();
  });

  it("reports a settled query with results once, not again on re-render", async () => {
    const twoResults = {
      docs: [
        { categories: [], id: "1", name: "Hallo", playbackId: "abc" },
        { categories: [], id: "2", name: "Dag", playbackId: "def" },
      ],
      page: 1,
      totalDocs: 2,
      totalPages: 1,
    };
    global.fetch = jest.fn(() => json(twoResults)) as unknown as typeof fetch;

    const { rerender } = render(<SearchScreen />);
    type("hal");

    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledWith("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 2,
      source: "submit",
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);

    // A bare re-render (no prop/state change) never re-runs the effect at
    // all, so the real risk this guards against is settling the *same*
    // query a second time — cleared, then retyped identically, which
    // fetches again and hands back a brand-new `data` object for the same
    // string.
    rerender(<SearchScreen />);
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledTimes(1);

    fireEvent.changeText(screen.getByLabelText("Zoeken"), "");
    fireEvent(screen.getByLabelText("Zoeken"), "submitEditing");
    await screen.findByText(/typ om een gebaar te zoeken/i);

    type("hal");
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("reports a settled query with no results", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], page: 1, totalDocs: 0, totalPages: 1 })
    ) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("zzzzzz");

    await screen.findByText(/geen gebaren gevonden/i);

    expect(trackEvent).toHaveBeenCalledWith("search_performed", {
      category_count: 0,
      has_results: false,
      query_length: 6,
      result_count: 0,
      source: "submit",
    });
  });

  it("reports nothing when the search request fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    render(<SearchScreen />);
    type("hal");

    await screen.findByText(/probeer opnieuw/i);

    expect(trackEvent).not.toHaveBeenCalled();
  });
});
