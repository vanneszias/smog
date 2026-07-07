import { ArrowLeft, ListPlus } from "lucide-react";
import { ShimmerSkeleton, Skeleton } from "../common/Skeleton";

export function GestureDetailSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header with back button and list action */}
      <div className="mb-6 flex items-center justify-between">
        {/* Back Button Skeleton */}
        <div className="inline-flex items-center gap-2 opacity-30">
          <ArrowLeft className="h-5 w-5" />
          <Skeleton className="h-5 w-32" />
        </div>

        {/* List action skeleton */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 opacity-50">
          <ListPlus className="h-5 w-5" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>

      {/* Title Skeleton */}
      <div className="mb-8">
        <Skeleton className="mb-4 h-10 w-3/4 md:w-2/3" />

        {/* Categories Skeleton */}
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>

      {/* Video Player Skeleton - Instagram-style with shimmer */}
      <div
        className="mb-8 overflow-hidden rounded-xl border border-border"
        style={{ backgroundColor: "var(--card)", aspectRatio: "3/4" }}
      >
        <ShimmerSkeleton
          className="h-full w-full"
          style={{ aspectRatio: "3/4", borderRadius: 0 }}
        />
      </div>

      {/* Description Section Skeleton */}
      <div
        className="mb-8 rounded-xl border border-border p-6"
        style={{ backgroundColor: "var(--card)" }}
      >
        <Skeleton className="mb-3 h-7 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      {/* Related Concepts Section Skeleton */}
      <div
        className="mb-8 rounded-xl border border-border p-6"
        style={{ backgroundColor: "var(--card)" }}
      >
        <Skeleton className="mb-3 h-7 w-40" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
