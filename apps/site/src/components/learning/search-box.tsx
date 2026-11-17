import { useRecentSearches } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, Card, cn, ListItem, SearchField, Text } from "@smog/ui-web";
import { History, Search } from "lucide-react";
import {
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";

function RecentSearch({
  onPick,
  query,
}: {
  onPick: (query: string) => void;
  query: string;
}): ReactNode {
  const pick = useCallback((): void => onPick(query), [onPick, query]);
  return <ListItem leading={<History />} onClick={pick} title={query} />;
}

/** How a search was started: Enter, or a recent search picked. */
export type SearchTrigger = "recent_search" | "submit";

export interface SearchBoxProps {
  /** `action` of the form without JavaScript (the home page: `/gestures`). */
  action?: string;
  label: string;
  /**
   * The box sits on the deep green (the home hero): the field and the
   * submit button take the white focus ring.
   */
  onGreen?: boolean;
  /**
   * Enter, or a recent search picked (a non-empty one is stored first);
   * `trigger` says which (`search_performed.source`).
   */
  onSubmit: (query: string, trigger: SearchTrigger) => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  size?: "md" | "lg";
  /** Adds an orange submit button (the "do it") with this label. */
  submitLabel?: string;
  value: string;
}

/** The kit's `focusRingOnGreen`: the white ring with a green offset. */
const FOCUS_ON_GREEN =
  "focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

/**
 * The search field in a `search` landmark. While it is focused and empty,
 * recent searches (on the device, spec §11) show under it; submitted
 * queries are added to them.
 */
export function SearchBox({
  action,
  label,
  onSubmit,
  onGreen = false,
  onValueChange,
  placeholder,
  size = "lg",
  submitLabel,
  value,
}: SearchBoxProps): ReactNode {
  const { t } = useTranslation();
  const recentSearches = useRecentSearches();
  const recent = recentSearches.items;
  const { add, clear } = recentSearches;
  const recentId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const showRecent = focused && value.trim() === "" && recent.length > 0;

  const run = useCallback(
    (query: string, trigger: SearchTrigger): void => {
      if (query) {
        add(query).catch((error: unknown) => {
          console.error("[search] Failed to store a recent search:", error);
        });
      }
      onSubmit(query, trigger);
    },
    [add, onSubmit]
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      inputRef.current?.blur();
      setFocused(false);
      run(value.trim(), "submit");
    },
    [run, value]
  );
  const clearRecent = useCallback((): void => {
    clear().catch((error: unknown) => {
      console.error("[search] Failed to clear recent searches:", error);
    });
  }, [clear]);
  const focus = useCallback((): void => setFocused(true), []);
  // Focus inside the box (the field or a recent search) keeps it open.
  const blur = useCallback((event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocused(false);
    }
  }, []);
  const pick = useCallback(
    (query: string): void => {
      setFocused(false);
      onValueChange(query);
      run(query, "recent_search");
    },
    [onValueChange, run]
  );

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: tracks focus within the box (the field and its recent searches); no action of its own.
    <search className="relative flex flex-col" onBlur={blur} onFocus={focus}>
      <form
        action={action}
        className="flex items-center gap-2"
        method="get"
        onSubmit={submit}
        role="none"
      >
        <div className="min-w-0 flex-1">
          <SearchField
            aria-controls={showRecent ? recentId : undefined}
            aria-label={label}
            autoComplete="off"
            className={onGreen ? FOCUS_ON_GREEN : undefined}
            name="q"
            onValueChange={onValueChange}
            placeholder={placeholder}
            ref={inputRef}
            size={size}
            value={value}
          />
        </div>
        {submitLabel ? (
          <Button
            className={cn("shrink-0 px-4 sm:px-6", onGreen && FOCUS_ON_GREEN)}
            icon={<Search />}
            size={size}
            type="submit"
            variant="action"
          >
            {/* Icon only on a phone, so the field keeps its width. */}
            <span className="sr-only sm:not-sr-only">{submitLabel}</span>
          </Button>
        ) : null}
      </form>
      {showRecent ? (
        <Card
          aria-label={t("search.recent")}
          className="absolute top-full right-0 left-0 z-30 mt-2 flex flex-col gap-1 p-2"
          id={recentId}
          role="region"
          variant="raised"
        >
          <div className="flex items-center justify-between gap-2 px-2">
            <Text as="span" size="body-sm" tone="muted" weight="medium">
              {t("search.recent")}
            </Text>
            <Button
              aria-label={t("search.clearRecent")}
              onClick={clearRecent}
              size="sm"
              variant="ghost"
            >
              {t("kit.clear")}
            </Button>
          </div>
          <ul className="flex flex-col">
            {recent.map((query) => (
              <li key={query}>
                <RecentSearch onPick={pick} query={query} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </search>
  );
}
