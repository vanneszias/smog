import { useMuxAssets } from "@smog/admin/client";
import type { MuxAssetItem, MuxAssetStatus } from "@smog/admin/schema";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { Check, ChevronLeft, ChevronRight, Film } from "lucide-react";
import { type ReactNode, useCallback, useId, useState } from "react";

export interface MuxPickerProps {
  /** Off until the tab is shown, so the list is not fetched for nothing. */
  enabled?: boolean;
  onSelect: (asset: MuxAssetItem) => void;
  /** The asset (or playback id) the field holds, marked as chosen. */
  selected?: { muxAssetId?: string | undefined; playbackId: string } | null;
}

const PAGE_SIZE = 12;
const THUMB_WIDTH = 240;

const STATUS_VARIANT = {
  errored: "danger",
  preparing: "warning",
  ready: "success",
} as const satisfies Record<MuxAssetStatus, string>;

/** One literal key per status (no template-literal keys; DECISIONS). */
const STATUS_LABEL_KEYS = {
  errored: "admin.mux.picker.status.errored",
  preparing: "admin.mux.picker.status.preparing",
  ready: "admin.mux.picker.status.ready",
} as const satisfies Record<MuxAssetStatus, TranslationKey>;

function isSelected(
  asset: MuxAssetItem,
  selected: MuxPickerProps["selected"]
): boolean {
  if (!selected) {
    return false;
  }
  return selected.muxAssetId
    ? selected.muxAssetId === asset.id
    : selected.playbackId === asset.playbackId;
}

function AssetCard({
  asset,
  chosen,
  onSelect,
}: {
  asset: MuxAssetItem;
  chosen: boolean;
  onSelect: (asset: MuxAssetItem) => void;
}): ReactNode {
  const { i18n, t } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
  }).format(asset.createdAt);
  const used = asset.usedBy.length;
  // Only a ready asset plays: a preparing or errored one would leave the
  // gesture without a video.
  const choosable = asset.status === "ready";
  const reasonId = useId();
  const choose = useCallback(() => onSelect(asset), [asset, onSelect]);
  return (
    <li
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-surface",
        chosen ? "border-primary ring-2 ring-primary" : "border-border-subtle"
      )}
      data-testid="mux-asset"
    >
      <img
        alt={t("admin.mux.picker.thumbnail", { date })}
        className="aspect-3/4 w-full bg-surface-sunken object-cover"
        height={Math.round((THUMB_WIDTH * 4) / 3)}
        loading="lazy"
        src={muxThumbnailUrl(asset.playbackId, { width: THUMB_WIDTH })}
        width={THUMB_WIDTH}
      />
      <div className="flex flex-1 flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={STATUS_VARIANT[asset.status]}>
            {t(STATUS_LABEL_KEYS[asset.status])}
          </Badge>
          {asset.duration === null ? null : (
            <Badge>
              {t("admin.mux.picker.duration", {
                seconds: Math.round(asset.duration),
              })}
            </Badge>
          )}
        </div>
        <Text
          size="caption"
          title={
            used > 0
              ? t("admin.mux.picker.usedByNames", {
                  names: asset.usedBy.map((gesture) => gesture.name).join(", "),
                })
              : undefined
          }
          tone="muted"
        >
          {used > 0
            ? t("admin.mux.picker.usedBy", { count: used })
            : t("admin.mux.picker.unused")}
        </Text>
        {choosable ? null : (
          <Text id={reasonId} size="caption" tone="muted">
            {t("admin.mux.picker.notReady")}
          </Text>
        )}
        <Button
          aria-describedby={choosable ? undefined : reasonId}
          aria-pressed={chosen}
          className="mt-auto"
          disabled={!choosable}
          icon={chosen ? <Check /> : undefined}
          onClick={choose}
          size="sm"
          type="button"
          variant={chosen ? "primary" : "secondary"}
        >
          {chosen ? t("admin.mux.picker.chosen") : t("admin.mux.picker.choose")}
        </Button>
      </div>
    </li>
  );
}

/**
 * Previous / next without a total: Mux reports none, and a page can be
 * empty of public assets while later ones are not.
 */
function PickerPager({
  hasMore,
  onPage,
  page,
}: {
  hasMore: boolean;
  onPage: (page: number) => void;
  page: number;
}): ReactNode {
  const { t } = useTranslation();
  const previous = useCallback(() => onPage(page - 1), [onPage, page]);
  const next = useCallback(() => onPage(page + 1), [onPage, page]);
  return (
    <nav
      aria-label={t("admin.mux.picker.page", { page })}
      className="flex items-center justify-between gap-3"
    >
      <Button
        disabled={page <= 1}
        icon={<ChevronLeft />}
        onClick={previous}
        size="sm"
        type="button"
        variant="secondary"
      >
        {t("admin.mux.picker.previous")}
      </Button>
      <Text aria-current="page" size="body-sm" tone="muted">
        {t("admin.mux.picker.page", { page })}
      </Text>
      <Button
        disabled={!hasMore}
        onClick={next}
        size="sm"
        type="button"
        variant="secondary"
      >
        {t("admin.mux.picker.next")}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
    </nav>
  );
}

const GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6";

/**
 * The "Choose existing" tab of `VideoField`: a paged grid of the Mux
 * assets with a public playback id (`admin.mux.assets`), each with its
 * status and how many gestures use it. Skeleton, EmptyState and
 * ErrorState per spec §16.
 */
export function MuxPicker({
  enabled = true,
  onSelect,
  selected = null,
}: MuxPickerProps): ReactNode {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useMuxAssets({ enabled, limit: PAGE_SIZE, page });
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch(() => undefined);
  }, [refetch]);

  if (query.isPending) {
    return (
      <ul
        aria-busy="true"
        aria-label={t("admin.mux.picker.loading")}
        className={GRID}
      >
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
          <li className="flex flex-col gap-2" key={index}>
            <Skeleton className="aspect-3/4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </li>
        ))}
      </ul>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        description={t("admin.mux.picker.error")}
        level={3}
        onRetry={retry}
        retrying={query.isFetching}
      />
    );
  }
  const { hasMore, items } = query.data;
  if (items.length === 0 && page === 1 && !hasMore) {
    return (
      <EmptyState
        description={t("admin.mux.picker.emptyDescription")}
        icon={<Film />}
        level={3}
        title={t("admin.mux.picker.empty")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul aria-busy={query.isPlaceholderData} className={GRID}>
        {items.map((asset) => (
          <AssetCard
            asset={asset}
            chosen={isSelected(asset, selected)}
            key={asset.id}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {page > 1 || hasMore ? (
        <PickerPager hasMore={hasMore} onPage={setPage} page={page} />
      ) : null}
    </div>
  );
}
