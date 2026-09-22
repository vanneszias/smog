import { fireEvent, render, screen } from "@testing-library/react-native";
import { trackEvent } from "@/lib/analytics";
import SearchScreen from "../../app/(tabs)/search";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
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

    // A bare re-render (no prop/state change) — this screen has no page
    // control of its own, so a re-render is the testable stand-in for
    // "checked again while still on the same settled query" — must not
    // count as a second search.
    rerender(<SearchScreen />);
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("fires again when the same query is settled on a second time, after changing", async () => {
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

    render(<SearchScreen />);
    type("hal");
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledTimes(1);

    // Changing the query away — even clearing it — and then settling on
    // the exact same string again is a new search, per `apps/native`
    // (`SearchScreen.tsx` ~111-125), which fired on every submit. This is
    // the scenario the dedup guard must not overcount into silence:
    // clearing the query is what used to leave the "already reported"
    // marker stuck on "hal" forever.
    fireEvent.changeText(screen.getByLabelText("Zoeken"), "");
    fireEvent(screen.getByLabelText("Zoeken"), "submitEditing");
    await screen.findByText(/typ om een gebaar te zoeken/i);

    type("hal");
    await screen.findByText("Hallo");

    expect(trackEvent).toHaveBeenCalledWith("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 2,
      source: "submit",
    });
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  describe("a query refined into another (final review, Important)", () => {
    const EMPTY = { docs: [], page: 1, totalDocs: 0, totalPages: 1 };
    const byQuery = (answers: Record<string, () => Promise<Response>>) =>
      jest.fn((url: string) => {
        const q = new URL(String(url)).searchParams.get("q") ?? "";
        return answers[q]();
      }) as unknown as typeof fetch;

    it("reports the new query's own counts, never the previous query's", async () => {
      global.fetch = byQuery({
        hal: () => json(PAGE),
        halzzz: () => json(EMPTY),
      });

      render(<SearchScreen />);
      type("hal");
      await screen.findByText("Hallo");
      expect(trackEvent).toHaveBeenCalledTimes(1);

      type("halzzz");
      await screen.findByText(/geen gebaren gevonden/i);

      expect(trackEvent).toHaveBeenCalledTimes(2);
      expect(trackEvent).toHaveBeenLastCalledWith("search_performed", {
        category_count: 0,
        has_results: false,
        query_length: 6,
        result_count: 0,
        source: "submit",
      });
      expect(trackEvent).not.toHaveBeenCalledWith(
        "search_performed",
        expect.objectContaining({ has_results: true, query_length: 6 })
      );
    });

    it("reports nothing for a refined query that fails", async () => {
      global.fetch = byQuery({
        hal: () => json(PAGE),
        halx: () => Promise.reject(new TypeError("Network request failed")),
      });

      render(<SearchScreen />);
      type("hal");
      await screen.findByText("Hallo");

      type("halx");
      await screen.findByText(/probeer opnieuw/i);

      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith(
        "search_performed",
        expect.objectContaining({ query_length: 3 })
      );
    });

    it("reports a failed refined query once its retry succeeds, with the retry's counts", async () => {
      let halzzz: () => Promise<Response> = () =>
        Promise.reject(new TypeError("Network request failed"));
      global.fetch = byQuery({ hal: () => json(PAGE), halzzz: () => halzzz() });

      render(<SearchScreen />);
      type("hal");
      await screen.findByText("Hallo");
      type("halzzz");
      await screen.findByText(/probeer opnieuw/i);
      expect(trackEvent).toHaveBeenCalledTimes(1);

      halzzz = () => json(EMPTY);
      fireEvent.press(screen.getByTestId("retry"));
      await screen.findByText(/geen gebaren gevonden/i);

      expect(trackEvent).toHaveBeenCalledTimes(2);
      expect(trackEvent).toHaveBeenLastCalledWith("search_performed", {
        category_count: 0,
        has_results: false,
        query_length: 6,
        result_count: 0,
        source: "submit",
      });
    });
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
