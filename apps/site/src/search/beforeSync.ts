import type { DocToSync } from "@payloadcms/plugin-search/types";

/**
 * The parts of a gesture the search index cares about.
 *
 * The plugin types `originalDoc` as `{ [key: string]: any }`, which type-checks
 * every possible misspelling. Narrowing it here is what makes a renamed field
 * a compile error. The narrowing stays compatible with the hook the plugin
 * actually calls because `payload.config.ts` passes this function as the
 * plugin's `beforeSync`, whose declared type is `BeforeSync` — so a drifted
 * signature fails `check-types` at that call site.
 */
interface GestureDoc {
  name?: null | string;
  concepts?: (null | string)[] | null;
  isActive?: boolean | null;
}

interface BeforeSyncGestureArgs {
  originalDoc: GestureDoc;
  searchDoc: DocToSync;
}

/**
 * Projects a gesture onto its search index entry.
 *
 * `searchDoc` arrives as `{ doc: { relationTo, value }, title }` — see
 * `@payloadcms/plugin-search/dist/utilities/syncDocAsSearchIndex.js` (3.89.0).
 * It is spread rather than rebuilt so the `doc` relationship survives: it is
 * the only link back to the gesture, and both the update path and
 * `deleteFromSearch` find the entry by it.
 *
 * `title` is set from `name` because gestures have no `title` field, so the
 * `title` the plugin puts on `searchDoc` is `undefined`.
 *
 * `concepts` is flattened to a single string: the index is queried with
 * `like`, and a `hasMany` relationship of its own would cost a join per
 * search for no gain.
 *
 * `isActive` is mirrored so the index can be filtered the same way the
 * gestures collection is — see `access/publicReadActive`. It defaults to
 * `false`, not `true`: an unset flag hides the gesture from a public read, so
 * an unset flag must hide its index entry too, or search becomes a way to
 * enumerate gestures nobody is allowed to fetch.
 *
 * Localization: the plugin calls this once per *request* locale, not once per
 * configured locale (`syncDocAsSearchIndex` uses `locale || req.locale`), and
 * re-fetches `originalDoc` in that locale first. So a gesture saved in `nl`
 * writes only the `nl` values here; `en`/`fr` index entries appear when the
 * gesture is saved in those locales, or on a reindex, which does loop every
 * locale.
 */
export const beforeSyncGesture = ({
  originalDoc,
  searchDoc,
}: BeforeSyncGestureArgs): DocToSync => ({
  ...searchDoc,
  title: originalDoc.name ?? "",
  concepts: (originalDoc.concepts ?? []).filter(Boolean).join(" "),
  isActive: originalDoc.isActive ?? false,
});
