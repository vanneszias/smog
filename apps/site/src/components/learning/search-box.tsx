import { useRecentSearches } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, Card, ListItem, SearchField, Text } from "@smog/ui-web";
import { History } from "lucide-react";
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

export interface SearchBoxProps {
  /** `action` of the form without JavaScript (the home page: `/gestures`). */
  action?: string;
  label: string;
  /** Enter, or a recent search picked (a non-empty one is stored first). */
  onSubmit: (query: string) => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  size?: "md" | "lg";
  value: string;
}

/**
 * The search field in a `search` landmark. While it is focused and empty,
 * recent searches (on the device, spec §11) show under it; submitted
 * queries are added to them.
 */
export function SearchBox({
  action,
  label,
  onSubmit,
  onValueChange,
  placeholder,
  size = "lg",
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
    (query: string): void => {
      if (query) {
        add(query).catch((error: unknown) => {
          console.error("[search] Failed to store a recent search:", error);
        });
      }
      onSubmit(query);
    },
    [add, onSubmit]
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      inputRef.current?.blur();
      setFocused(false);
      run(value.trim());
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
      run(query);
    },
    [onValueChange, run]
  );

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: tracks focus within the box (the field and its recent searches); no action of its own.
    <search className="relative flex flex-col" onBlur={blur} onFocus={focus}>
      <form action={action} method="get" onSubmit={submit} role="none">
        <SearchField
          aria-controls={showRecent ? recentId : undefined}
          aria-label={label}
          autoComplete="off"
          name="q"
          onValueChange={onValueChange}
          placeholder={placeholder}
          ref={inputRef}
          size={size}
          value={value}
        />
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
