import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";

interface MuxVideoPickerProps {
  onSelect: (playbackId: string) => void;
  selectedPlaybackId?: string;
}

export function MuxVideoPicker({
  onSelect,
  selectedPlaybackId,
}: MuxVideoPickerProps) {
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const limit = 12;

  const { data, isLoading } = useQuery(
    orpc.admin.mux.listAssets.queryOptions({
      limit,
      page,
    })
  );

  const handleSelect = (playbackId: string) => {
    if (previewId === playbackId) {
      // Double click - confirm selection
      onSelect(playbackId);
    } else {
      // Single click - preview
      setPreviewId(playbackId);
    }
  };

  const handleConfirm = () => {
    if (previewId) {
      onSelect(previewId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const assets = data?.assets || [];

  if (assets.length === 0 && page === 1) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
        <p>No videos found in Mux</p>
        <p className="text-sm">Upload a new video to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview */}
      {previewId && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border">
            <MuxPlayer
              loop
              muted
              playbackId={previewId}
              streamType="on-demand"
              style={{ width: "100%", aspectRatio: "16/9" }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="break-all font-mono text-muted-foreground text-xs">
              {previewId}
            </p>
            <Button onClick={handleConfirm} size="sm">
              Use This Video
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {assets.map((asset) => {
          const isSelected = selectedPlaybackId === asset.playbackId;
          const isPreviewing = previewId === asset.playbackId;

          return (
            <button
              className={`relative aspect-video overflow-hidden rounded-lg border-2 transition-all hover:border-primary ${
                isSelected
                  ? "border-green-500"
                  : isPreviewing
                    ? "border-primary"
                    : "border-transparent"
              }`}
              key={asset.id}
              onClick={() => handleSelect(asset.playbackId)}
              type="button"
            >
              <img
                alt="Video thumbnail"
                className="h-full w-full object-cover"
                height={135}
                loading="lazy"
                src={`https://image.mux.com/${asset.playbackId}/thumbnail.webp?width=240&height=135&time=0`}
                width={240}
              />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
              )}
              {asset.status !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {asset.duration && (
                <div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-white text-xs">
                  {formatDuration(asset.duration)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          size="sm"
          variant="outline"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="text-muted-foreground text-sm">Page {page}</span>
        <Button
          disabled={!data?.hasMore}
          onClick={() => setPage((p) => p + 1)}
          size="sm"
          variant="outline"
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
