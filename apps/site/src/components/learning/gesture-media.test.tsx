import { describe, expect, mock, test } from "bun:test";
import type { GestureDetail } from "@smog/gestures/schema";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

/** mux-player needs a real browser; the page only has to mount it. */
mock.module("@mux/mux-player-react", () => ({
  default: (): ReactNode => <div data-testid="mux" />,
}));

const { GestureDetailView } = await import("./gesture-detail");
const { useHearts } = await import("./use-hearts");
const { renderSite } = await import("@/test/render");

const BASE: GestureDetail = {
  audioPath: null,
  categories: [],
  description: "",
  fallbackUsed: false,
  id: "g-hond",
  keywords: [],
  name: "Hond",
  needsRecut: false,
  playbackId: "pb-hond",
  slug: "hond",
  sponsor: null,
};

function detailOf(gesture: GestureDetail): () => ReactNode {
  return function Detail(): ReactNode {
    const hearts = useHearts("gesture_detail");
    return (
      <div data-testid="page">
        <GestureDetailView
          gesture={gesture}
          hearts={hearts}
          layout="page"
          related={{
            data: [],
            isError: false,
            isRefetching: false,
            refetch: () => undefined,
          }}
          viewSource="favorites"
        />
      </div>
    );
  };
}

function overlay(): Element | null {
  return document.querySelector('[data-slot="video-name-overlay"]');
}

describe("the name over the video and the spoken name (phase 10b)", () => {
  test("a video that still has the name in the picture gets no overlay and no toggle", async () => {
    await renderSite(detailOf({ ...BASE, needsRecut: true }));
    await screen.findByRole("heading", { name: "Hond" });
    expect(overlay()).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  test("a textless video shows the name once the device store is read, decoration only", async () => {
    await renderSite(detailOf(BASE));
    await waitFor(() => expect(overlay()).not.toBeNull());
    expect(overlay()?.getAttribute("aria-hidden")).toBe("true");
    // The page's name is the heading and the frame's label; the overlay adds no third reading.
    expect(screen.getAllByRole("heading", { name: "Hond" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Hond" })).toBeDefined();
  });

  test("the viewer can hide the name and show it again (kept on this device in the local store)", async () => {
    await renderSite(detailOf(BASE));
    await waitFor(() => expect(overlay()).not.toBeNull());
    fireEvent.click(
      screen.getByRole("switch", { name: "Show the name on the video" })
    );
    await waitFor(() => expect(overlay()).toBeNull());
    const toggle = screen.getByRole("switch", {
      name: "Show the name on the video",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(overlay()).not.toBeNull());
  });

  test("the audio button is there only when the language has a clip", async () => {
    await renderSite(detailOf({ ...BASE, audioPath: "/api/audio/g/nl/u" }));
    expect(
      await screen.findByRole("button", { name: "Listen to the pronunciation" })
    ).toBeDefined();
    cleanup();
    await renderSite(detailOf(BASE));
    await screen.findByRole("heading", { name: "Hond" });
    expect(
      screen.queryByRole("button", { name: "Listen to the pronunciation" })
    ).toBeNull();
  });
});
