import type { GestureSummary } from "@smog/ui-web";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeConsent } from "@/lib/consentStore";
import { GestureResults } from "./GestureResults";

/*
 * `next/navigation`'s hooks read a router context that only exists inside a
 * rendered Next tree — stubbed the same way `LocaleSwitcher.test.tsx` stubs
 * it, with a mutable query the tests reassign per case.
 */
const navigation = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const gesture = (id: string): GestureSummary => ({
  categories: [],
  id,
  name: `Gebaar ${id}`,
  playbackId: null,
});

describe("GestureResults", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    writeConsent("granted");
    navigation.query = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    fetchSpy.mockRestore();
  });

  const mount = (gestures: GestureSummary[]) => {
    act(() => {
      root.render(<GestureResults gestures={gestures} locale="nl" />);
    });
  };

  it("reports nothing for the unfiltered list", () => {
    navigation.query = "";
    mount([gesture("1")]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a search with its result count", () => {
    navigation.query = "q=hallo";
    mount([gesture("1"), gesture("2")]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      payload: {
        name: "search_performed",
        properties: {
          category_count: 0,
          has_results: true,
          platform: "web",
          query_length: 5,
          result_count: 2,
          source: "filter_change",
        },
      },
      type: "track",
    });
  });

  it("reports a category filter with no query the same way", () => {
    navigation.query = "category=3";
    mount([]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.payload.properties.category_count).toBe(1);
    expect(body.payload.properties.has_results).toBe(false);
  });

  it("does not report again for a page change on the same search", () => {
    navigation.query = "q=hallo";
    mount([gesture("1")]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    navigation.query = "q=hallo&page=2";
    mount([gesture("2")]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reports again once the query actually changes", () => {
    navigation.query = "q=hallo";
    mount([gesture("1")]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    navigation.query = "q=doei";
    mount([gesture("2")]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
