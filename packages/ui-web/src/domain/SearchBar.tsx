import { Search, X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Label } from "../components/Label";
import { cn } from "../lib/cn";

const DEFAULT_DELAY_MS = 300;

export type SearchBarProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "onSubmit" | "children"
> & {
  /** Called with the query, debounced while typing and at once on submit. */
  onSearch: (query: string) => void;
  defaultValue?: string;
  /** Milliseconds of quiet before a typed query is reported. */
  delay?: number;
  label?: string;
  placeholder?: string;
  clearLabel?: string;
};

/**
 * A search field that reports what it has, when it is worth reporting.
 *
 * Three behaviours, and the second and third are the ones that get forgotten:
 *
 * - typing is **debounced**, restarting the clock on every keystroke rather
 *   than rate-limiting it, so a word typed at speed is one query and not
 *   five;
 * - pressing Enter reports **immediately and cancels the pending debounce**,
 *   or the same query arrives twice and the slower answer lands last;
 * - clearing reports the empty query immediately, cancels the same way, and
 *   **puts focus back in the field** — the clear button unmounts itself, and
 *   focus would otherwise fall to `<body>`.
 *
 * The component holds the query itself. A page that needs to own it can read
 * every change through `onSearch` and re-mount with a new `defaultValue`;
 * making it controlled would put the debounce in the caller's hands, which is
 * the thing it exists to take away.
 *
 * `type="button"` on the clear control is load-bearing: `Button` sets no
 * default type, an HTML button without one submits its form, and this one
 * lives in a form.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      className,
      onSearch,
      defaultValue = "",
      delay = DEFAULT_DELAY_MS,
      label = "Zoeken",
      placeholder,
      clearLabel = "Wissen",
      ...props
    },
    ref
  ) => {
    const id = useId();
    const [query, setQuery] = useState(defaultValue);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const cancel = useCallback(() => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
    }, []);

    /*
     * A debounce that outlives its component calls back into a page that has
     * moved on. Nothing else clears this timer on unmount.
     */
    useEffect(() => cancel, [cancel]);

    const commit = (next: string) => {
      cancel();
      onSearch(next);
    };

    const handleChange = (event: FormEvent<HTMLInputElement>) => {
      const next = event.currentTarget.value;
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
      // biome-ignore lint/a11y/useSemanticElements: the suggested <search> element cannot be the form, and this element has to be a <form> — pressing Enter in the field submits it, which is where "search now, do not wait for the debounce" comes from. `role="search"` on the form is the landmark pattern WAI-ARIA documents for exactly this element.
      <form
        className={cn("relative w-full", className)}
        onSubmit={(event) => {
          event.preventDefault();
          commit(query);
        }}
        role="search"
        {...props}
      >
        <Label className="sr-only" htmlFor={id}>
          {label}
        </Label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-muted"
        />
        <Input
          className="px-10"
          id={id}
          onChange={handleChange}
          placeholder={placeholder}
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === "function") {
              ref(node);
            } else if (ref != null) {
              ref.current = node;
            }
          }}
          type="search"
          value={query}
        />
        {query === "" ? null : (
          <Button
            aria-label={clearLabel}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
            onClick={handleClear}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </form>
    );
  }
);

SearchBar.displayName = "SearchBar";
