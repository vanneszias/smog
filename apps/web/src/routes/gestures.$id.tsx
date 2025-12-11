import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/gestures/$id")({
  component: GestureDetailComponent,
});

function GestureDetailComponent() {
  const { id } = Route.useParams();
  const gestureQuery = useQuery(
    orpc.gestures.getById.queryOptions({
      input: { id },
    })
  );

  if (gestureQuery.isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="py-12 text-center">Loading gesture details...</div>
      </div>
    );
  }

  if (gestureQuery.error) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="py-12 text-center text-red-600">
          Error loading gesture. Please try again later.
        </div>
      </div>
    );
  }

  if (!gestureQuery.data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="py-12 text-center">Gesture not found.</div>
        <div className="text-center">
          <Link className="text-primary hover:underline" to="/gestures">
            Back to Gestures
          </Link>
        </div>
      </div>
    );
  }

  const gesture = gestureQuery.data;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4">
        <Link className="text-primary hover:underline" to="/gestures">
          ← Back to Gestures
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="mb-4 font-bold text-4xl">{gesture.name}</h1>

        <div className="mb-4 flex flex-wrap gap-2">
          {gesture.categories.map((cat: { _id: string; name: string }) => (
            <span
              className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground"
              key={cat._id}
            >
              {cat.name}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-8 overflow-hidden rounded-lg border bg-card">
        <MuxPlayer
          accentColor="#2563eb"
          playbackId={gesture.playbackId}
          streamType="on-demand"
        />
      </div>

      {gesture.info ? (
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="mb-3 font-semibold text-xl">Description</h2>
          <p className="text-muted-foreground leading-relaxed">
            {gesture.info}
          </p>
        </div>
      ) : null}

      {gesture.concept.length > 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-3 font-semibold text-xl">Related Concepts</h2>
          <div className="flex flex-wrap gap-2">
            {gesture.concept.map((c: string) => (
              <span className="rounded-md bg-muted px-3 py-1 text-sm" key={c}>
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
