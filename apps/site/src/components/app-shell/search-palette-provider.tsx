import { useTranslation } from "@smog/i18n/react";
import { useToast } from "@smog/ui-web";
import {
  Component,
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
import type { SearchPalette as SearchPaletteComponent } from "./search-palette";

/*
 * The global search palette: the state and the `/` shortcut live here (a
 * few hundred bytes); the palette itself (cmdk, the dialog, the search
 * hooks) is its own chunk, fetched the first time it is opened. The fetch
 * is tried twice; when it still fails (offline, a stale chunk after a
 * deploy) the palette closes with a toast instead of taking the page down.
 */

interface PaletteModule {
  default: typeof SearchPaletteComponent;
}

type PaletteLoader = () => Promise<PaletteModule>;

function importPalette(): Promise<PaletteModule> {
  return import("./search-palette").then((module) => ({
    default: module.SearchPalette,
  }));
}

/** Loads the palette chunk; a failed import is tried once more. */
export async function loadPaletteChunk(
  load: PaletteLoader = importPalette
): Promise<PaletteModule> {
  try {
    return await load();
  } catch {
    return await load();
  }
}

/** Catches the chunk's failure (`lazy` throws its rejection at render) and reports it. */
class PaletteBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

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
function isEditingTarget(target: EventTarget | null): boolean {
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

/**
 * Provides `useSearchPalette` and renders the palette; `/` opens it from
 * anywhere. `loadPalette` is a seam for tests.
 */
export function SearchPaletteProvider({
  children,
  loadPalette,
}: {
  children: ReactNode;
  loadPalette?: PaletteLoader;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so closing keeps its exit animation.
  const [loaded, setLoaded] = useState(false);
  // `lazy` caches a rejection: every attempt gets its own component (and
  // boundary), so opening again after a failure fetches the chunk again.
  const [attempt, setAttempt] = useState(0);
  const Palette = useMemo(
    () => lazy(() => loadPaletteChunk(loadPalette)),
    // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry key
    [attempt, loadPalette]
  );
  const show = useCallback((): void => {
    setLoaded(true);
    setOpen(true);
  }, []);
  const failed = useCallback(
    (error: unknown): void => {
      console.error("[search] Failed to load the palette:", error);
      setOpen(false);
      setLoaded(false);
      setAttempt((n) => n + 1);
      toast({ title: t("searchPalette.loadFailed"), variant: "danger" });
    },
    [t, toast]
  );
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
        <PaletteBoundary key={attempt} onError={failed}>
          <Suspense fallback={null}>
            <Palette onOpenChange={setOpen} open={open} />
          </Suspense>
        </PaletteBoundary>
      ) : null}
    </SearchPaletteContext>
  );
}
