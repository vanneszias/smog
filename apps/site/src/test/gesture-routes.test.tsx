import { describe, expect, mock, test } from "bun:test";
import type { AnalyticsEvent } from "@smog/analytics/schema";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// mux-player needs a real browser.
mock.module("@mux/mux-player-react", () => ({
  default: (): ReactNode => <div data-testid="mux" />,
}));

const { Route: GestureRoute, validateGestureSearch } = await import(
  "@/routes/gestures/$slug"
);
const { Route: BrowseRoute } = await import("@/routes/gestures/index");
const { renderSite } = await import("@/test/render");

const HOND = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  id: "g-hond",
  name: "Hond",
  playbackId: "pb-hond",
  slug: "hond",
};
const DETAIL = {
  ...HOND,
  canonicalSlug: "hond",
  description: "",
  keywords: [],
  publishedAt: 0,
  sponsor: null,
  updatedAt: 0,
};
const API = {
  "gestures/bySlug": DETAIL,
  "gestures/categories": [{ gestureCount: 1, name: "Dieren", slug: "dieren" }],
  "gestures/list": { items: [HOND], nextCursor: null },
  "gestures/related": [],
  "gestures/search": (input: unknown) => {
    const { q } = input as { q: string };
    const items = "hond".startsWith(q.toLowerCase())
      ? [{ ...HOND, matchedField: "name", matchType: "startsWith", score: 1 }]
      : [];
    return { items, total: items.length };
  },
};

function viewed(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.filter((event) => event.name === "gesture_viewed");
}

function searchSources(events: AnalyticsEvent[]): string[] {
  return events
    .filter((event) => event.name === "search_performed")
    .map((event) => (event.properties as { source: string }).source);
}

describe("/gestures/$slug", () => {
  test("validateGestureSearch keeps a known source and drops the rest", () => {
    expect(validateGestureSearch({ from: "favorites" })).toEqual({
      from: "favorites",
    });
    expect(validateGestureSearch({ from: "bogus" })).toEqual({});
    expect(validateGestureSearch({ from: "direct" })).toEqual({});
    expect(validateGestureSearch({})).toEqual({});
  });

  test("tracks ?from= as the source, then takes it out of the URL", async () => {
    const { events, router } = await renderSite(null, {
      api: API,
      path: "/gestures/hond?from=favorites",
      routes: [[GestureRoute, "/gestures/$slug"]],
    });
    await screen.findByRole("heading", { level: 1, name: "Hond" });
    await waitFor(() =>
      expect(router.state.location.href).toBe("/gestures/hond")
    );
    expect(viewed(events)).toEqual([
      {
        name: "gesture_viewed",
        properties: { gesture_id: "g-hond", source: "favorites" },
      },
    ]);
  });

  test("a bogus ?from= counts as direct", async () => {
    const { events } = await renderSite(null, {
      api: API,
      path: "/gestures/hond?from=bogus",
      routes: [[GestureRoute, "/gestures/$slug"]],
    });
    await screen.findByRole("heading", { level: 1, name: "Hond" });
    await waitFor(() => expect(viewed(events)).toHaveLength(1));
    expect(viewed(events)[0]?.properties).toEqual({
      gesture_id: "g-hond",
      source: "direct",
    });
  });
});

describe("/gestures (search sources)", () => {
  test("a ?q= landing is submit, typing is filter_change, a chip is filter_change", async () => {
    const { events } = await renderSite(null, {
      api: API,
      path: "/gestures?q=hond",
      routes: [[BrowseRoute, "/gestures/"]],
    });
    await waitFor(() => expect(searchSources(events)).toEqual(["submit"]));

    const field = screen.getByRole("searchbox");
    fireEvent.change(field, { target: { value: "ho" } });
    await waitFor(() =>
      expect(searchSources(events)).toEqual(["submit", "filter_change"])
    );

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Dieren" }));
    });
    await waitFor(() =>
      expect(searchSources(events)).toEqual([
        "submit",
        "filter_change",
        "filter_change",
      ])
    );
  });

  test("the detail beside the results counts as search_results", async () => {
    const { events } = await renderSite(null, {
      api: API,
      path: "/gestures?q=hond&selected=hond",
      routes: [[BrowseRoute, "/gestures/"]],
    });
    await waitFor(() => expect(viewed(events)).toHaveLength(1));
    expect(viewed(events)[0]?.properties).toEqual({
      gesture_id: "g-hond",
      source: "search_results",
    });
  });
});
