import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import { LinkedGestureGrid } from "./gesture-cards";
import { gestureHref } from "./links";
import type { Hearts } from "./use-hearts";

const HEARTS: Hearts = { isFavorite: () => false, toggle: () => undefined };
const KAT_NAME = /Kat/;
const KAT = {
  categories: [],
  id: "g-kat",
  name: "Kat",
  playbackId: "pb-kat",
  slug: "kat",
};

describe("gesture links", () => {
  test("carry where the gesture was opened from (none for direct)", () => {
    expect(gestureHref("hond")).toBe("/gestures/hond");
    expect(gestureHref("hond", "direct")).toBe("/gestures/hond");
    expect(gestureHref("hond", "favorites")).toBe(
      "/gestures/hond?from=favorites"
    );
    expect(gestureHref("één twee")).toBe("/gestures/%C3%A9%C3%A9n%20twee");
  });

  test("a card grid links with its source", async () => {
    function Grid(): ReactNode {
      return (
        <div data-testid="page">
          <LinkedGestureGrid from="favorites" hearts={HEARTS} items={[KAT]} />
        </div>
      );
    }
    await renderSite(Grid);
    expect(
      screen.getByRole("link", { name: KAT_NAME }).getAttribute("href")
    ).toBe("/gestures/kat?from=favorites");
  });
});
