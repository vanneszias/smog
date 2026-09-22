import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View, type ViewProps } from "react-native";
import { Text } from "../components/Text";
import { cn } from "../lib/cn";

const DEFAULT_DELAY_MS = 300;

export type SearchBarProps = Omit<ViewProps, "children"> & {
  /** Called with the query, debounced while typing and at once on submit. */
  onSearch: (query: string) => void;
  defaultValue?: string;
  /** Milliseconds of quiet before a typed query is reported. */
  delay?: number;
  label?: string;
  placeholder?: string;
  clearLabel?: string;
  className?: string;
};

/**
 * The native twin of `packages/ui-web/src/domain/SearchBar.tsx`. A phone has
 * no Enter key, so "submit" here is the keyboard's own search action —
 * `returnKeyType="search"` and `onSubmitEditing` — rather than a `<form>`.
 *
 * Three behaviours, identical to web's:
 *
 * - typing is **debounced**, restarting the clock on every keystroke rather
 *   than rate-limiting it, so a word typed at speed is one query and not
 *   five;
 * - submitting reports **immediately and cancels the pending debounce**, or
 *   the same query arrives twice and the slower answer lands last;
 * - clearing reports the empty query immediately, cancels the same way, and
 *   returns focus to the field — the clear button unmounts itself once the
 *   field is empty, and focus would otherwise fall nowhere.
 *
 * The component holds the query itself, same reasoning as web's own: a page
 * that needs to own it reads every change through `onSearch`.
 */
export function SearchBar({
  className,
  clearLabel = "Wissen",
  defaultValue = "",
  delay = DEFAULT_DELAY_MS,
  label = "Zoeken",
  onSearch,
  placeholder,
  testID = "root",
  ...props
}: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);

  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  /*
   * A debounce that outlives its component calls back into a screen that has
   * moved on. Nothing else clears this timer on unmount.
   */
  useEffect(() => cancel, [cancel]);

  const commit = (next: string) => {
    cancel();
    onSearch(next);
  };

  const handleChangeText = (next: string) => {
    setQuery(next);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onSearch(next);
    }, delay);
  };

  const handleClear = () => {
    setQuery("");
    commit("");
    inputRef.current?.focus();
  };

  return (
    <View
      accessibilityRole="search"
      className={cn("relative w-full", className)}
      testID={testID}
      {...props}
    >
      <TextInput
        accessibilityLabel={label}
        className="h-10 w-full rounded-md border border-border bg-surface px-md pr-12 text-foreground"
        onChangeText={handleChangeText}
        onSubmitEditing={() => commit(query)}
        placeholder={placeholder}
        ref={inputRef}
        returnKeyType="search"
        testID={`${testID}-field`}
        value={query}
      />
      {query === "" ? null : (
        <Pressable
          accessibilityLabel={clearLabel}
          accessibilityRole="button"
          className="absolute top-1/2 right-1 h-8 w-8 items-center justify-center"
          onPress={handleClear}
          testID={`${testID}-clear`}
        >
          <Text className="text-foreground-muted">×</Text>
        </Pressable>
      )}
    </View>
  );
}
