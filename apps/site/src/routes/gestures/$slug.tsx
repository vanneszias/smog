import { ORPCError } from "@orpc/client";
import type { GestureViewSource } from "@smog/analytics/schema";
import {
  gestureOptions,
  gestureViewSource,
  relatedOptions,
  useGesture,
  useRelated,
} from "@smog/gestures/client";
import { muxStreamUrl, muxThumbnailUrl } from "@smog/utils";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { OpenInApp } from "@/components/app-banner";
import {
  GestureDetailView,
  RELATED_LIMIT,
} from "@/components/learning/gesture-detail";
import { GestureDetailSkeleton } from "@/components/learning/gesture-detail-skeleton";
import { gestureHref } from "@/components/learning/links";
import { Page, RouteError } from "@/components/learning/page";
import { useHearts } from "@/components/learning/use-hearts";
import { pageMeta, seoHead, shellHead } from "@/lib/head";
import type { RouterContext } from "@/router";

/** What the head needs (the full detail is in the query cache). */
export interface GestureHead {
  description: string;
  name: string;
  playbackId: string;
  /** Epoch ms. */
  publishedAt: number;
  slug: string;
  /** Epoch ms. */
  updatedAt: number;
}

/** `?from=`: where the gesture was opened from (cards and links set it). */
export interface GestureSearch {
  from?: GestureViewSource;
}

/** A known `from` is kept; anything else is dropped (it counts as `direct`). */
export function validateGestureSearch(
  search: Record<string, unknown>
): GestureSearch {
  const from = gestureViewSource(search.from);
  return from === "direct" ? {} : { from };
}

/**
 * The detail, then its related gestures (two D1 reads). A legacy id or an
 * old slug answers 301 to the canonical slug with the query string kept
 * (spec §9), before `related` is read; an unknown one is the 404 page.
 */
async function loadGesture({
  context,
  location,
  params,
}: {
  context: RouterContext;
  location: { searchStr: string };
  params: { slug: string };
}): Promise<GestureHead> {
  const { queryClient, queryUtils } = context;
  const gesture = await queryClient
    .ensureQueryData(gestureOptions(queryUtils.gestures, params.slug))
    .catch((error: unknown) => {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    });
  if (gesture.canonicalSlug !== params.slug) {
    throw redirect({
      href: `${gestureHref(gesture.canonicalSlug)}${location.searchStr}`,
      statusCode: 301,
    });
  }
  await queryClient.prefetchQuery(
    relatedOptions(queryUtils.gestures, gesture.slug, RELATED_LIMIT)
  );
  return {
    description: gesture.description,
    name: gesture.name,
    playbackId: gesture.playbackId,
    publishedAt: gesture.publishedAt,
    slug: gesture.slug,
    updatedAt: gesture.updatedAt,
  };
}

export const Route = createFileRoute("/gestures/$slug")({
  component: GesturePage,
  errorComponent: RouteError,
  head: ({ loaderData, matches }) => {
    if (!loaderData) {
      return pageMeta(matches, "states.notFound.title");
    }
    const { siteUrl, t } = shellHead(matches);
    const path = gestureHref(loaderData.slug);
    const description =
      loaderData.description ||
      t("gesture.metaDescription", { name: loaderData.name });
    const image = muxThumbnailUrl(loaderData.playbackId, { width: 1200 });
    return seoHead(matches, {
      description,
      image,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        contentUrl: muxStreamUrl(loaderData.playbackId),
        dateModified: new Date(loaderData.updatedAt).toISOString(),
        description,
        name: loaderData.name,
        thumbnailUrl: image,
        uploadDate: new Date(loaderData.publishedAt).toISOString(),
        url: `${siteUrl}${path}`,
      },
      path,
      title: loaderData.name,
      type: "video.other",
    });
  },
  loader: loadGesture,
  validateSearch: validateGestureSearch,
});

/**
 * `?from=` is read once: the detail tracks `gesture_viewed` with it (its
 * effect runs first, in the same commit), then it leaves the URL, so a
 * reload or a copied address counts as `direct`. The router's own
 * navigation keeps its location in step; `from` is no loader dependency.
 */
function useViewSource(ready: boolean): GestureViewSource {
  const search: Record<string, unknown> = Route.useSearch();
  const navigate = Route.useNavigate();
  // The root passes unvalidated params through, so check `from` again.
  const source = gestureViewSource(search.from);
  const present = search.from !== undefined;
  useEffect(() => {
    if (!(ready && present)) {
      return;
    }
    navigate({
      replace: true,
      resetScroll: false,
      search: ({ from: _from, ...rest }: Record<string, unknown>) => rest,
    } as never).catch((error: unknown) => {
      console.error("[gesture] Failed to clean the URL:", error);
    });
  }, [navigate, present, ready]);
  return source;
}

function GesturePage(): ReactNode {
  const { slug } = Route.useParams();
  const gesture = useGesture(slug);
  const related = useRelated(slug, RELATED_LIMIT);
  const hearts = useHearts("gesture_detail");
  const viewSource = useViewSource(gesture.data !== undefined);
  return (
    <Page>
      <OpenInApp path={gestureHref(slug)} />
      {gesture.data ? (
        <GestureDetailView
          gesture={gesture.data}
          hearts={hearts}
          layout="page"
          related={related}
          viewSource={viewSource}
        />
      ) : (
        <GestureDetailSkeleton />
      )}
    </Page>
  );
}
