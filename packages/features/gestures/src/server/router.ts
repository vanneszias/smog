import { implementRpc } from "@smog/rpc";
import { InvalidCursorError } from "@smog/utils";
import { gesturesContract } from "../contract";
import { getCatalogCategories } from "./catalog-cache";
import {
  findGestureBySlug,
  findGesturesByIds,
  findRelatedGestures,
  listGestures,
  listSitemap,
} from "./queries";
import { searchGestures } from "./search";

const os = implementRpc(gesturesContract);

/**
 * The `gestures` slice of the app router. Every procedure is public (no
 * guard); the site's `RL_API` limit and `logErrors` apply to all of them.
 * Reads are in the request's language (`context.locale`: the cookie, then
 * Accept-Language, only an enabled language), the default text where a
 * gesture is untranslated (`fallbackUsed`). The sitemap is language-free.
 */
export const gesturesRouter = os.router({
  byIds: os.byIds.handler(
    async ({ context, input }) =>
      await findGesturesByIds(context.db, input.ids, context.locale)
  ),

  bySlug: os.bySlug.handler(async ({ context, errors, input }) => {
    const gesture = await findGestureBySlug(
      context.db,
      input.slug,
      context.locale
    );
    if (!gesture) {
      throw errors.NOT_FOUND();
    }
    return gesture;
  }),

  // From the catalog snapshot (isolate memory per catalog version).
  categories: os.categories.handler(
    async ({ context }) =>
      await getCatalogCategories(context.db, context.kv, context.locale)
  ),

  list: os.list.handler(async ({ context, errors, input }) => {
    try {
      return await listGestures(context.db, input, context.locale);
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        throw errors.VALIDATION({
          data: { fieldErrors: { cursor: ["invalid"] }, formErrors: [] },
        });
      }
      throw error;
    }
  }),

  related: os.related.handler(
    async ({ context, input }) =>
      await findRelatedGestures(
        context.db,
        input.slug,
        input.limit,
        context.locale
      )
  ),

  // Analytics: search_performed is sent by the client (useGestureSearch), never the query text.
  search: os.search.handler(
    async ({ context, input }) =>
      await searchGestures(
        { db: context.db, kv: context.kv, locale: context.locale },
        input
      )
  ),

  sitemap: os.sitemap.handler(
    async ({ context }) => await listSitemap(context.db)
  ),
});
