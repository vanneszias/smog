import { describe, expect, mock, test } from "bun:test";
import { COURSE_PROGRESS_KEY } from "@smog/gestures/client";
import type { GestureDetail } from "@smog/gestures/schema";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";

/** mux-player needs a real browser; the kit turns its time updates into `onNearEnd`. */
interface MuxProps {
  onTimeUpdate?: (event: unknown) => void;
}
let player: MuxProps = {};
mock.module("@mux/mux-player-react", () => ({
  default: (props: MuxProps): ReactNode => {
    player = props;
    return <div data-testid="mux" />;
  },
}));

const { GestureDetailView } = await import("./gesture-detail");
const { useHearts } = await import("./use-hearts");
const { renderSite } = await import("@/test/render");

const HOND: GestureDetail = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  description: "Het gebaar voor hond.",
  id: "g-hond",
  keywords: ["huisdier"],
  name: "Hond",
  playbackId: "pb-hond",
  slug: "hond",
  sponsor: null,
};
const KAT_NAME = /Kat/;
const KAT = {
  categories: [],
  id: "g-kat",
  name: "Kat",
  playbackId: "pb-kat",
  slug: "kat",
};

function Detail(): ReactNode {
  const hearts = useHearts("gesture_detail");
  return (
    <div data-testid="page">
      <GestureDetailView
        gesture={HOND}
        hearts={hearts}
        layout="page"
        related={{
          data: [KAT],
          isError: false,
          isRefetching: false,
          refetch: () => undefined,
        }}
        viewSource="favorites"
      />
    </div>
  );
}

/** One playthrough of the (looping) video: the start, then 3 s before the end. */
async function playThrough(): Promise<void> {
  await screen.findByTestId("mux");
  act(() => {
    player.onTimeUpdate?.({ target: { currentTime: 0.5, duration: 20 } });
    player.onTimeUpdate?.({ target: { currentTime: 17, duration: 20 } });
  });
  // The course counter is async (localStorage through the store adapter).
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe("the gesture detail", () => {
  test("tracks gesture_viewed with its source, and video_playback_completed once per visit", async () => {
    const { events } = await renderSite(Detail);
    await waitFor(() =>
      expect(events).toContainEqual({
        name: "gesture_viewed",
        properties: { gesture_id: "g-hond", source: "favorites" },
      })
    );
    await playThrough();
    await playThrough();
    await playThrough();
    expect(
      events.filter((event) => event.name === "video_playback_completed")
    ).toEqual([
      {
        name: "video_playback_completed",
        properties: { gesture_id: "g-hond" },
      },
    ]);
  });

  test("shows the course banner on the seventh video, however often one loops", async () => {
    localStorage.setItem(COURSE_PROGRESS_KEY, "5");
    await renderSite(Detail);
    await playThrough();
    await playThrough();
    // Two loops of one video: the sixth video, not the seventh.
    expect(localStorage.getItem(COURSE_PROGRESS_KEY)).toBe("6");
    expect(screen.queryByText("Important notice")).toBeNull();

    // A new visit (the page again) is the seventh.
    cleanup();
    await renderSite(Detail);
    await playThrough();
    expect(await screen.findByText("Important notice")).toBeDefined();
    expect(localStorage.getItem(COURSE_PROGRESS_KEY)).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Important notice")).toBeNull();
  });

  test("the hearts report gesture_detail; related gestures link with their source", async () => {
    const { events } = await renderSite(Detail);
    const hearts = screen.getAllByRole("button", {
      name: "Favorite",
    });
    const [first] = hearts;
    if (!first) {
      throw new Error("No heart");
    }
    fireEvent.click(first);
    await waitFor(() =>
      expect(events).toContainEqual({
        name: "gesture_collection_changed",
        properties: {
          action: "added",
          collection: "favorites",
          gesture_id: "g-hond",
          source: "gesture_detail",
        },
      })
    );
    const related = screen.getByRole("link", { name: KAT_NAME });
    expect(related.getAttribute("href")).toBe(
      "/gestures/kat?from=related_gestures"
    );
  });
});
