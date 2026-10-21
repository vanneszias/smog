import { useSyncExternalStore } from "react";

/** The `md` breakpoint (Tailwind's 48 rem): below it the sidebar is a sheet. */
const MOBILE_QUERY = "(max-width: 47.99rem)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(MOBILE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True below `md`. The server and the first client render say false (desktop). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
