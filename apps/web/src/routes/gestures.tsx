import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/gestures")({
  component: GesturesComponent,
});

type Gesture = {
  _id: string;
  name: string;
  playbackId: string;
  concept: string[];
  info: string;
  categories: Array<{ _id: string; name: string }>;
};

function GesturesComponent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const gesturesQuery = useQuery(
    orpc.gestures.list.queryOptions({
      input: { cursor, numItems: 20 },
    })
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-3xl">Gestures Library</h1>
        <p className="text-muted-foreground">
          Browse and learn sign language gestures
        </p>
      </div>

      {gesturesQuery.isLoading ? (
        <div className="py-12 text-center">Loading gestures...</div>
      ) : null}

      {gesturesQuery.error ? (
        <div className="py-12 text-center text-red-600">
          Error loading gestures. Please try again later.
        </div>
      ) : null}

      {gesturesQuery.data ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {gesturesQuery.data.gestures.map((gesture: Gesture) => (
              <Link
                className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-lg"
                key={gesture._id}
                params={{ id: gesture._id }}
                to="/gestures/$id"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {gesture.playbackId ? (
                    <MuxPlayer
                      className="h-full w-full"
                      loop
                      muted
                      playbackId={gesture.playbackId}
                      streamType="on-demand"
                      style={{ height: "100%", width: "100%" }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      No video available
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="mb-2 font-semibold text-lg transition-colors group-hover:text-primary">
                    {gesture.name}
                  </h3>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {gesture.categories.map((cat) => (
                      <span
                        className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground text-xs"
                        key={cat._id}
                      >
                        {cat.name}
                      </span>
                    ))}
                  </div>
                  {gesture.concept.length > 0 && (
                    <p className="line-clamp-2 text-muted-foreground text-sm">
                      {gesture.concept.join(", ")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination controls */}
          <div className="mt-8 flex justify-center gap-4">
            {cursor ? (
              <button
                className="rounded-md border px-4 py-2 hover:bg-accent"
                onClick={() => setCursor(undefined)}
                type="button"
              >
                First Page
              </button>
            ) : null}
            {gesturesQuery.data.isDone ? null : (
              <button
                className="rounded-md border px-4 py-2 hover:bg-accent"
                onClick={() => setCursor(gesturesQuery.data.continueCursor)}
                type="button"
              >
                Next Page
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
