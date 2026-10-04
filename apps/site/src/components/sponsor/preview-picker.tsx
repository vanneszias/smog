import { useTranslation } from "@smog/i18n/react";
import { cn } from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

export interface PreviewGesture {
  id: string;
  name: string;
  playbackId: string;
}

export interface PreviewPickerProps {
  gestures: readonly PreviewGesture[];
  onSelect: (id: string) => void;
  selectedId: string;
}

/** The key that moves the focus, and where to (from `index` of `count`). */
function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The review step's gestures as a row of poster toggles (phase 7 ruling
 * 8): the Player above shows the pressed one. A toolbar: one tab stop, the
 * arrow keys (and Home, End) move the focus, Enter or Space chooses, and
 * the focus stays on the chosen toggle.
 */
export function PreviewPicker({
  gestures,
  onSelect,
  selectedId,
}: PreviewPickerProps): ReactNode {
  const { t } = useTranslation();
  const toolbar = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    gestures.findIndex((gesture) => gesture.id === selectedId)
  );
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  const tabStop = focusIndex < gestures.length ? focusIndex : selectedIndex;

  const onClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const index = Number(event.currentTarget.dataset.index);
      const gesture = gestures[index];
      if (gesture) {
        setFocusIndex(index);
        onSelect(gesture.id);
      }
    },
    [gestures, onSelect]
  );
  const onFocus = useCallback((event: FocusEvent<HTMLButtonElement>) => {
    setFocusIndex(Number(event.currentTarget.dataset.index));
  }, []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const index = Number(event.currentTarget.dataset.index);
      const next = nextIndex(event.key, index, gestures.length);
      if (next === null) {
        return;
      }
      event.preventDefault();
      setFocusIndex(next);
      toolbar.current
        ?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)
        ?.focus();
    },
    [gestures.length]
  );

  return (
    <div
      aria-label={t("sponsor.preview.picker")}
      className="flex flex-wrap gap-3"
      ref={toolbar}
      role="toolbar"
    >
      {gestures.map((gesture, index) => {
        const pressed = gesture.id === selectedId;
        return (
          <button
            aria-pressed={pressed}
            className={cn(
              "flex w-[5rem] flex-col gap-1 rounded-md border-2 bg-surface p-1 text-left text-foreground transition motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
              pressed
                ? "border-primary"
                : "border-border-subtle hover:border-border"
            )}
            data-index={index}
            key={gesture.id}
            onClick={onClick}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            tabIndex={index === tabStop ? 0 : -1}
            // The whole name on hover, past the two-line clamp (M-6).
            title={gesture.name}
            type="button"
          >
            <img
              alt=""
              className="aspect-3/4 w-full rounded-sm bg-surface-sunken object-cover"
              decoding="async"
              height={213}
              loading="lazy"
              src={muxThumbnailUrl(gesture.playbackId, { width: 160 })}
              width={160}
            />
            {/* Two lines, broken anywhere: "Goedemorgen" fits whole. */}
            <span className="wrap-anywhere line-clamp-2 px-0.5 text-caption">
              {gesture.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
