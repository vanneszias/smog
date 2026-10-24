import { useCategories, useGestureSearch } from "@smog/gestures/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { useGestureMarkers } from "@smog/lessons/client";
import { LESSON_MAX_GESTURES, type LessonItem } from "@smog/lessons/schema";
import { Badge, Button, CategoryChips, Field, Select } from "@smog/ui-web";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Command as CommandRoot,
} from "@smog/ui-web/command";
import { muxThumbnailUrl } from "@smog/utils";
import { Check, ImageIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { SectionRef } from "./lesson-draft";

/** How many gestures one search shows. */
const PICKER_LIMIT = 20;

/** The "before the first section" choice of the destination menu. */
const UNGROUPED = "";

export interface PickerDestination {
  label: string;
  /** The section, or `null` for the part before the first section. */
  value: SectionRef;
}

export interface GesturePickerProps {
  /** Where an added gesture goes (the builder's sections). */
  destinations: readonly PickerDestination[];
  /** A lesson holds at most so many gestures: nothing more can be added. */
  full: boolean;
  /** Ids already in the lesson: they stay listed, marked, and cannot be added twice. */
  held: ReadonlySet<string>;
  onAdd: (item: LessonItem, to: SectionRef) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function itemOf(gesture: GestureSummary, hasDrawing: boolean): LessonItem {
  return {
    hasDrawing,
    id: gesture.id,
    name: gesture.name,
    playbackId: gesture.playbackId,
    published: true,
    slug: gesture.slug,
  };
}

function PickItem({
  gesture,
  hasDrawing,
  held,
  onPick,
}: {
  gesture: GestureSummary;
  hasDrawing: boolean;
  held: boolean;
  onPick: (gesture: GestureSummary) => void;
}): ReactNode {
  const { t } = useTranslation();
  const select = useCallback(() => onPick(gesture), [gesture, onPick]);
  return (
    <CommandItem
      disabled={held}
      onSelect={select}
      value={`gesture:${gesture.id}`}
    >
      <img
        alt=""
        className="h-10 w-[30px] shrink-0 rounded-md bg-muted object-cover"
        decoding="async"
        height={40}
        loading="lazy"
        src={muxThumbnailUrl(gesture.playbackId, { width: 60 })}
        width={30}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{gesture.name}</span>
        <span className="truncate text-body-sm text-muted-foreground">
          {gesture.categories.map((category) => category.name).join(", ")}
        </span>
      </span>
      {hasDrawing ? (
        <Badge icon={<ImageIcon />} variant="neutral">
          {t("admin.lessons.item.drawing")}
        </Badge>
      ) : null}
      {held ? (
        <Badge icon={<Check />} variant="primary">
          {t("admin.lessons.picker.held")}
        </Badge>
      ) : null}
    </CommandItem>
  );
}

function PickerBody({
  destinations,
  full,
  held,
  onAdd,
  onOpenChange,
}: Omit<GesturePickerProps, "open">): ReactNode {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [destination, setDestination] = useState<string>(
    destinations.at(-1)?.value ?? UNGROUPED
  );
  // Picking a gesture for a lesson is not the catalogue search `search_performed` measures.
  const found = useGestureSearch({
    category: categories,
    limit: PICKER_LIMIT,
    q: query,
    track: false,
  });
  const allCategories = useCategories();
  const items = found.data?.items ?? [];
  const markers = useGestureMarkers(items.map((gesture) => gesture.id));
  const withDrawing = useMemo(
    () => new Set(markers.data?.withDrawing ?? []),
    [markers.data]
  );
  const options = useMemo(
    () =>
      destinations.map((choice) => ({
        label: choice.label,
        value: choice.value ?? UNGROUPED,
      })),
    [destinations]
  );
  const pick = useCallback(
    (gesture: GestureSummary): void => {
      if (full || held.has(gesture.id)) {
        return;
      }
      onAdd(
        itemOf(gesture, withDrawing.has(gesture.id)),
        destination === UNGROUPED ? null : destination
      );
    },
    [destination, full, held, onAdd, withDrawing]
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  let status = "";
  if (found.isError) {
    status = t("admin.lessons.picker.error");
  } else if (found.isDebouncing || found.isFetching || !found.data) {
    status = t("search.searching");
  } else if (found.data.total === 0) {
    status = t("search.noResults.title");
  } else {
    status = t("search.resultCount", { count: found.data.total });
  }
  return (
    <CommandRoot loop shouldFilter={false}>
      <CommandInput
        onValueChange={setQuery}
        placeholder={t("admin.lessons.picker.placeholder")}
        value={query}
      />
      <div className="flex flex-col gap-3 border-border-subtle border-b px-4 py-3">
        <CategoryChips
          aria-label={t("admin.lessons.picker.categories")}
          categories={allCategories.data ?? []}
          onChange={setCategories}
          selected={categories}
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field
            className="min-w-48 flex-1"
            label={t("admin.lessons.picker.destination")}
          >
            <Select
              onValueChange={setDestination}
              options={options}
              value={destination}
            />
          </Field>
          <Button onClick={close}>{t("admin.lessons.picker.done")}</Button>
        </div>
        {full ? (
          <p className="text-body-sm text-warning-strong" role="status">
            {t("admin.lessons.picker.full", { max: LESSON_MAX_GESTURES })}
          </p>
        ) : null}
      </div>
      <div
        aria-live="polite"
        className="px-4 pt-2 text-body-sm text-muted-foreground empty:hidden"
        data-testid="picker-status"
        role="status"
      >
        {status}
      </div>
      <CommandList>
        <CommandEmpty>{t("search.noResults.title")}</CommandEmpty>
        {items.length > 0 ? (
          <CommandGroup heading={t("nav.gestures")}>
            {items.map((gesture) => (
              <PickItem
                gesture={gesture}
                hasDrawing={withDrawing.has(gesture.id)}
                held={held.has(gesture.id)}
                key={gesture.id}
                onPick={pick}
              />
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandRoot>
  );
}

/**
 * The gesture picker of the lesson builder (spec 5.3): the search palette's
 * primitives (cmdk) in "pick" mode. It stays open while gestures are added
 * (each pick goes straight into the lesson, to the chosen section), filters by
 * category, marks the gestures that are already in the lesson and the ones
 * with a drawing, and refuses a gesture twice. A separate chunk: cmdk loads
 * when the picker first opens.
 */
export function GesturePicker({
  open,
  onOpenChange,
  ...body
}: GesturePickerProps): ReactNode {
  const { t } = useTranslation();
  return (
    <CommandDialog
      description={t("admin.lessons.picker.description")}
      onOpenChange={onOpenChange}
      open={open}
      title={t("admin.lessons.picker.title")}
    >
      <PickerBody onOpenChange={onOpenChange} {...body} />
    </CommandDialog>
  );
}
