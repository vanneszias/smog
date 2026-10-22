/**
 * The cached answers that are in the viewer's language (phase 10b task 5):
 * the gesture catalogue and the favorites and lists that embed gesture
 * summaries. A language change resets them, so no card keeps the old
 * language's name until its entry goes stale.
 */
const LOCALIZED_ROUTERS: ReadonlySet<string> = new Set([
  "favorites",
  "gestures",
  "lists",
]);

/** Whether a query (an oRPC key: `[["gestures", "list"], { input, type }]`) holds localized data. */
export function isLocalizedQuery(query: {
  queryKey: readonly unknown[];
}): boolean {
  const [path] = query.queryKey;
  return Array.isArray(path) && LOCALIZED_ROUTERS.has(String(path[0]));
}
