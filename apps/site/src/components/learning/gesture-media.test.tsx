import { describe, expect, mock, test } from "bun:test";
import type { GestureDetail } from "@smog/gestures/schema";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";

/** mux-player needs a real browser; the page only has to mount it. */
let timeUpdate: ((event: { target: unknown }) => void) | undefined;
mock.module("@mux/mux-player-react", () => ({
  default: (props: {
    onTimeUpdate?: (event: { target: unknown }) => void;
  }): ReactNode => {
    timeUpdate = props.onTimeUpdate;
    return <div data-testid="mux" />;
  },
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

describe("the sponsor end card on the gesture page (phase 10b ruling 9)", () => {
  const SPONSOR = {
    endCard: true,
    logoPath: "/api/sponsor-logos/0a1b2c3d-0000-4000-8000-000000000001",
    name: "Bakkerij JAN nv",
    until: 1_900_000_000_000,
  };
  const card = (): Element | null =>
    document.querySelector('[data-slot="sponsor-end-card"]');
  const at = (currentTime: number): void => {
    act(() => {
      timeUpdate?.({ target: { currentTime, duration: 20 } });
    });
  };

  test("a sponsored video shows the message, the name as typed and the logo over its last seconds", async () => {
    await renderSite(detailOf({ ...BASE, sponsor: SPONSOR }));
    await waitFor(() => expect(timeUpdate).toBeDefined());
    at(10);
    expect(card()).toBeNull();
    at(17);
    expect(card()?.textContent).toBe("Made possible byBakkerij JAN nv");
    expect(card()?.querySelector("img")?.getAttribute("src")).toBe(
      SPONSOR.logoPath
    );
    at(1);
    expect(card()).toBeNull();
  });

  test("shows it over a video that still has the gesture's name burned in too (needs re-cut): the card is the sponsor's, not the name's", async () => {
    await renderSite(detailOf({ ...BASE, needsRecut: true, sponsor: SPONSOR }));
    await waitFor(() => expect(timeUpdate).toBeDefined());
    at(18);
    expect(card()).not.toBeNull();
  });

  test("shows none without a sponsor, or over a rendered video that carries the name", async () => {
    await renderSite(detailOf(BASE));
    await waitFor(() => expect(timeUpdate).toBeDefined());
    at(19);
    expect(card()).toBeNull();
    cleanup();
    await renderSite(
      detailOf({
        ...BASE,
        sponsor: { ...SPONSOR, endCard: false, logoPath: null },
      })
    );
    await waitFor(() => expect(timeUpdate).toBeDefined());
    at(19);
    expect(card()).toBeNull();
  });
});
