import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
 * The global search palette: the state and the `/` shortcut live here (a
 * few hundred bytes); the palette itself (cmdk, the dialog, the search
 * hooks) is its own chunk, fetched the first time it is opened.
 */

const SearchPalette = lazy(() =>
  import("./search-palette").then((module) => ({
    default: module.SearchPalette,
  }))
);

interface SearchPaletteApi {
  open: () => void;
}

const SearchPaletteContext = createContext<SearchPaletteApi>({
  open: () => undefined,
});

/** Opens the palette (the header's search button). */
export function useSearchPalette(): SearchPaletteApi {
  return useContext(SearchPaletteContext);
}

/** Whether a keystroke is for a text field (or other editor), not for a shortcut. */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='searchbox'], [role='combobox']"
    ) !== null
  );
}

/** A plain `/`: no modifier, not repeating, not typed into a field. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === "/" &&
    !event.repeat &&
    !event.defaultPrevented &&
    !(event.ctrlKey || event.metaKey || event.altKey) &&
    !isEditingTarget(event.target)
  );
}

/** Provides `useSearchPalette` and renders the palette; `/` opens it from anywhere. */
export function SearchPaletteProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so closing keeps its exit animation.
  const [loaded, setLoaded] = useState(false);
  const show = useCallback((): void => {
    setLoaded(true);
    setOpen(true);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Not on top of another dialog (a sheet, the QR code, a confirmation).
      if (
        isSearchShortcut(event) &&
        document.querySelector("[role='dialog'], [role='alertdialog']") === null
      ) {
        event.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [show]);
  const api = useMemo(() => ({ open: show }), [show]);
  return (
    <SearchPaletteContext value={api}>
      {children}
      {loaded ? (
        <Suspense fallback={null}>
          <SearchPalette onOpenChange={setOpen} open={open} />
        </Suspense>
      ) : null}
    </SearchPaletteContext>
  );
}
