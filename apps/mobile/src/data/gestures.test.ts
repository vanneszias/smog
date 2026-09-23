import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useCategories, useGesture, useGestures } from "./gestures";

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

const fetchMock = () => global.fetch as unknown as jest.Mock;

describe("useGestures", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;
  });

  it("starts loading and has no data yet", async () => {
    const { result } = renderHook(() => useGestures({}));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    // Flushed rather than left pending, so the mocked response resolving
    // does not update state after this test has already moved on.
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("resolves the page once the request completes", async () => {
    const { result } = renderHook(() => useGestures({}));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(PAGE);
    expect(result.current.error).toBeNull();
  });

  it("sends the locale, page and category on the request", async () => {
    renderHook(() => useGestures({ category: "3", page: 2 }));

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());

    const [url] = fetchMock().mock.calls[0];

    expect(url).toContain("/mobile/gestures");
    expect(url).toContain("page=2");
    expect(url).toContain("category=3");
    expect(url).toContain("locale=");
  });

  it("sends q only for a non-blank query", async () => {
    renderHook(() => useGestures({ q: "  " }));

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());

    const [url] = fetchMock().mock.calls[0];

    expect(url).not.toContain("q=");
  });

  it("turns a rejected request into an error rather than throwing", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useGestures({}));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("does not fetch at all while disabled", async () => {
    renderHook(() => useGestures({ enabled: false }));

    // Give any accidental request a turn of the microtask queue to have
    // fired before asserting its absence.
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("reflects becoming enabled with a fresh request", async () => {
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) => useGestures({ enabled }),
      { initialProps: { enabled: false } }
    );

    expect(result.current.loading).toBe(false);
    expect(fetchMock()).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(PAGE);
  });

  it("refetches on demand", async () => {
    const { result } = renderHook(() => useGestures({}));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));
  });
});

describe("useGesture", () => {
  it("maps the raw response into a GestureSummary", async () => {
    global.fetch = jest.fn(() =>
      json({
        categories: [{ id: 3, name: "Groeten" }, 4],
        id: 7,
        name: "Hallo",
        playbackId: "abc",
      })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useGesture("7"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({
      categories: [{ id: "3", name: "Groeten" }],
      id: "7",
      name: "Hallo",
      playbackId: "abc",
    });
  });

  it("requests the id it was given, at depth 1", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: null })
    ) as unknown as typeof fetch;

    renderHook(() => useGesture("7"));

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());

    const [url] = fetchMock().mock.calls[0];

    expect(url).toContain("/gestures/7");
    expect(url).toContain("depth=1");
  });

  it.each([
    ".",
    "..",
    "%2E%2E",
    "../users/me",
    "abc",
    "",
  ])("answers the id %j as not found without a request", async (id) => {
    global.fetch = jest.fn(() =>
      json({ docs: [], totalDocs: 0 })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useGesture(id));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // `payloadFetch` resolves paths with `new URL`, so `..` would have
    // fetched `/api/` and `.` the gesture list.
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.error?.status).toBe(404);
  });

  it("surfaces a 404 as an error rather than a crash", async () => {
    global.fetch = jest.fn(() =>
      json({ errors: [{ message: "Not Found" }] }, 404)
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useGesture("999"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});

describe("useCategories", () => {
  it("resolves the category options", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [{ id: 3, name: "Groeten" }] })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([{ id: "3", name: "Groeten" }]);
  });

  it("requests the categories collection directly, not a mobile endpoint", async () => {
    global.fetch = jest.fn(() => json({ docs: [] })) as unknown as typeof fetch;

    renderHook(() => useCategories());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());

    const [url] = fetchMock().mock.calls[0];

    expect(url).toContain("/api/categories");
    expect(url).not.toContain("/mobile/categories");
  });
});
