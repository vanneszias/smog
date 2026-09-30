import { ORPCError } from "@orpc/client";
import { useGesture, useRelated } from "@smog/gestures/client";
import { muxStreamUrl, muxThumbnailUrl } from "@smog/utils";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  GestureDetailView,
  RELATED_LIMIT,
} from "@/components/learning/gesture-detail";
import { GestureDetailSkeleton } from "@/components/learning/gesture-detail-skeleton";
import { gestureHref } from "@/components/learning/links";
import { Page, RouteError } from "@/components/learning/page";
import { useHearts } from "@/components/learning/use-hearts";
import { gestureOptions, relatedOptions } from "@/lib/gesture-queries";
import { pageMeta, seoHead, shellHead } from "@/lib/head";
import type { RouterContext } from "@/router";

/** What the head needs (the full detail is in the query cache). */
export interface GestureHead {
  description: string;
  name: string;
  playbackId: string;
  slug: string;
}

// The detail and its related gestures in parallel (two D1 reads); a
// legacy id answers 301 to the slug, an unknown one the 404 page.
async function loadGesture({
  context,
  params,
}: {
  context: RouterContext;
  params: { slug: string };
}): Promise<GestureHead> {
  const { queryClient, queryUtils } = context;
  const [gesture] = await Promise.all([
    queryClient
      .ensureQueryData(gestureOptions(queryUtils, params.slug))
      .catch((error: unknown) => {
        if (error instanceof ORPCError && error.code === "NOT_FOUND") {
          throw notFound();
        }
        throw error;
      }),
    queryClient.prefetchQuery(
      relatedOptions(queryUtils, params.slug, RELATED_LIMIT)
    ),
  ]);
  if (gesture.canonicalSlug !== params.slug) {
    throw redirect({
      params: { slug: gesture.canonicalSlug },
      statusCode: 301,
      to: "/gestures/$slug",
    });
  }
  return {
    description: gesture.description,
    name: gesture.name,
    playbackId: gesture.playbackId,
    slug: gesture.slug,
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
        description,
        name: loaderData.name,
        thumbnailUrl: image,
        url: `${siteUrl}${path}`,
      },
      path,
      title: loaderData.name,
      type: "video.other",
    });
  },
  loader: loadGesture,
});

function GesturePage(): ReactNode {
  const { slug } = Route.useParams();
  const gesture = useGesture(slug);
  const related = useRelated(slug, RELATED_LIMIT);
  const hearts = useHearts();
  return (
    <Page>
      {gesture.data ? (
        <GestureDetailView
          gesture={gesture.data}
          hearts={hearts}
          layout="page"
          related={related}
        />
      ) : (
        <GestureDetailSkeleton />
      )}
    </Page>
  );
}
