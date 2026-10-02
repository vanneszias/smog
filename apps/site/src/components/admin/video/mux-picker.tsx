import { useMuxAssets } from "@smog/admin/client";
import type { MuxAssetItem } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  Pagination,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { Check, Film } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

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
} as const;

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
            {t(`admin.mux.picker.status.${asset.status}`)}
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
        <Button
          aria-pressed={chosen}
          className="mt-auto"
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
  if (items.length === 0 && page === 1) {
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
        <Pagination
          onPageChange={setPage}
          page={page}
          pageCount={hasMore ? page + 1 : page}
        />
      ) : null}
    </div>
  );
}
