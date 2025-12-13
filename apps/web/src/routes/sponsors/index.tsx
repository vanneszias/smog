import { api } from "@smog/convex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Clock, Sparkles } from "lucide-react";

export const Route = createFileRoute("/sponsors/")({
  component: SponsorsComponent,
});

function GestureCard({
  gesture,
}: {
  gesture: {
    _id: string;
    name: string;
    playbackId: string;
    sponsorship: {
      endDate: number;
    } | null;
  };
}) {
  const isSponsored = Boolean(gesture.sponsorship);
  const endDate = gesture.sponsorship
    ? new Date(gesture.sponsorship.endDate)
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Video Preview */}
      <div className="relative aspect-video bg-black">
        {/*<video
          autoPlay
          className="h-full w-full object-cover"
          loop
          muted
          playsInline
          src={`https://stream.mux.com/${gesture.playbackId}.m3u8`}
        />*/}
        {isSponsored ? (
          <div className="absolute top-2 right-2 rounded bg-yellow-500 px-2 py-1 font-semibold text-black text-xs">
            Sponsored
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="mb-2 font-semibold text-lg"
          style={{ color: "var(--text)" }}
        >
          {gesture.name}
        </h3>

        {/* Status */}
        {isSponsored ? (
          endDate !== null ? (
            <div
              className="mb-4 flex items-center text-sm"
              style={{ color: "var(--text-light)" }}
            >
              <Clock className="mr-1 h-4 w-4" />
              Sponsored until {endDate.toLocaleDateString()}
            </div>
          ) : null
        ) : (
          <div className="mb-4 text-sm" style={{ color: "var(--accent)" }}>
            Available for sponsorship
          </div>
        )}

        {/* Action Button */}
        <Link
          className={`block w-full rounded px-4 py-2 text-center font-medium transition-colors ${
            isSponsored
              ? "cursor-not-allowed bg-gray-300 text-gray-500"
              : "bg-primary text-white hover:opacity-90"
          }`}
          disabled={isSponsored}
          style={
            isSponsored ? undefined : { backgroundColor: "var(--primary)" }
          }
          to={isSponsored ? "#" : `/sponsors/${gesture._id}`}
        >
          {isSponsored ? "Not Available" : "Sponsor This Gesture"}
        </Link>
      </div>
    </div>
  );
}

function SponsorsComponent() {
  const gesturesWithSponsorship = useQuery(
    api.sponsorships.listGesturesWithSponsorship,
    {}
  );

  const isLoading = gesturesWithSponsorship === undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="mb-4 font-bold text-4xl"
            style={{ color: "var(--text)" }}
          >
            <Sparkles className="mr-2 inline h-8 w-8" />
            Sponsor a Gesture
          </h1>
          <p
            className="mx-auto max-w-2xl text-lg"
            style={{ color: "var(--text-light)" }}
          >
            Choose a gesture to sponsor with your brand. Your custom overlay
            will appear in the video for the duration of your sponsorship.
          </p>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center" style={{ color: "var(--text-light)" }}>
            Loading gestures...
          </div>
        ) : null}

        {/* Gesture Grid */}
        {!isLoading && gesturesWithSponsorship ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {gesturesWithSponsorship.map((gesture) => (
              <GestureCard gesture={gesture} key={gesture._id} />
            ))}
          </div>
        ) : null}

        {/* Empty State */}
        {!isLoading &&
        gesturesWithSponsorship &&
        gesturesWithSponsorship.length === 0 ? (
          <div className="text-center" style={{ color: "var(--text-light)" }}>
            No gestures available at the moment.
          </div>
        ) : null}

        {/* Info Section */}
        <div className="mt-12 rounded-lg border border-border bg-card p-6">
          <h2
            className="mb-4 font-semibold text-xl"
            style={{ color: "var(--text)" }}
          >
            How It Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundColor: "var(--primary)" }}
              >
                1
              </div>
              <h3
                className="mb-2 font-semibold"
                style={{ color: "var(--text)" }}
              >
                Choose & Customize
              </h3>
              <p className="text-sm" style={{ color: "var(--text-light)" }}>
                Select a gesture and upload your image with custom text (max 50
                characters)
              </p>
            </div>
            <div>
              <div
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundColor: "var(--primary)" }}
              >
                2
              </div>
              <h3
                className="mb-2 font-semibold"
                style={{ color: "var(--text)" }}
              >
                Preview & Pay
              </h3>
              <p className="text-sm" style={{ color: "var(--text-light)" }}>
                Preview your sponsored video and complete payment. Pricing
                starts at €50 per week.
              </p>
            </div>
            <div>
              <div
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundColor: "var(--primary)" }}
              >
                3
              </div>
              <h3
                className="mb-2 font-semibold"
                style={{ color: "var(--text)" }}
              >
                Go Live
              </h3>
              <p className="text-sm" style={{ color: "var(--text-light)" }}>
                Your sponsored video goes live immediately and runs for your
                selected duration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
