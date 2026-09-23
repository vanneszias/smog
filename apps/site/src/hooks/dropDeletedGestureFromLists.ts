import type { CollectionBeforeDeleteHook } from "payload";
import { resolveRelationshipId } from "@/collections/Lists";

/**
 * Removes a gesture from every list that holds it, just before the gesture
 * itself is deleted.
 *
 * The referential-integrity rule for `lists.items.gesture` is *drop the array
 * row* — the list survives; it just loses an entry — and that is deliberately
 * not the same answer as the one next door: `sponsorships.gesture` refuses the
 * delete outright, because someone paid for it. Both rules live on
 * `gestures.beforeDelete`, and conflating them would either destroy list
 * entries a refused delete should have left alone or block an admin from
 * deleting a gesture merely because somebody favourited it.
 *
 * **Ordering is the only guard there is.** `blockDeleteWhenSponsored` is
 * registered first, and Payload runs `beforeDelete` hooks sequentially in
 * array order, awaiting each (`collections/operations/deleteByID.js` and
 * `delete.js`, 3.89.0), so a sponsored gesture is refused before this hook
 * touches a list. It is tempting to call that belt-and-braces on the grounds
 * that `deleteByID` wraps everything in `initTransaction` /
 * `killTransaction` — and it is wrong. `sqliteD1Adapter` is constructed
 * without `transactionOptions` (see `payload.config.ts`), so the adapter
 * takes Payload's `defaultBeginTransaction()`, which resolves to `null`;
 * `initTransaction` therefore returns false, no transaction is ever opened,
 * and `killTransaction` rolls back nothing. Reversing the two hooks really
 * does leave a refused delete having already emptied every list that held
 * the gesture, and mutation testing confirmed it: swapping them fails
 * `Lists.delete.int.test.ts`'s "refuses a sponsored gesture without
 * stripping it from any list" against a real database, not merely the
 * config-shaped assertion in `Gestures.test.ts`.
 *
 * **Why `payload.update` rather than deleting the `lists_items` rows
 * directly.** The array rows carry `_order`, and Payload's array writer
 * rewrites the whole set on update (`@payloadcms/drizzle`'s `upsertRow`
 * calls `deleteExistingArrayRows` and then `insertArrays`, re-deriving
 * `_order` from the incoming array's index). Reaching past that into the
 * table would leave Payload's idea of the list and the database's out of
 * step, and would skip the `items` `beforeChange` hook that owns dedupe and
 * `addedBy` carry-forward.
 *
 * **Which is exactly why the surviving rows are sent back verbatim and in
 * order.** Because the writer re-derives `_order` from array position, the
 * one thing this hook must not do is rebuild the array — from a re-query,
 * from a Set, from anything but `filter` over the rows as read. Each
 * surviving row keeps its own `id`, `gesture` and `addedBy`: the `id` so the
 * row is recognisably the same row, and `addedBy` explicitly so the
 * carry-forward pass has nothing to guess at. `Lists.delete.int.test.ts`
 * pins the surviving order against a list whose order is deliberately not
 * ascending by id, because that is the failure no "the list survived"
 * assertion would notice.
 *
 * **Sequentially, not `Promise.all`.** Every update runs on the caller's
 * `req`, and so on one D1 session; issuing them concurrently interleaves
 * statements on a single connection. Passing `req` is still right even
 * though it buys no transaction here — it carries the locale and the user,
 * and it is what would enlist these writes if `transactionOptions` were
 * ever turned on.
 */
export const dropDeletedGestureFromLists: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const { docs } = await req.payload.find({
    collection: "lists",
    depth: 0,
    overrideAccess: true,
    // Every holder, not a page of them. A gesture in more lists than the
    // default limit would otherwise leave the remainder pointing at a row
    // that is about to vanish, and the delete would fail on the first one
    // this missed — after the lists it did reach had already been rewritten,
    // because there is no transaction to undo them.
    pagination: false,
    req,
    where: { "items.gesture": { equals: id } },
  });

  for (const list of docs) {
    const items = list.items ?? [];
    const remaining = items.filter(
      (item) => resolveRelationshipId(item.gesture) !== id
    );

    if (remaining.length === items.length) {
      continue;
    }

    await req.payload.update({
      collection: "lists",
      data: {
        items: remaining.map((item) => {
          const addedBy = resolveRelationshipId(item.addedBy);
          // The D1/SQLite adapter gives documents integer ids, so a
          // relationship resolves to a number or to nothing — the `string`
          // arm of `resolveRelationshipId` is there for Mongo-backed
          // projects and is unreachable here. Narrowing on `number` rather
          // than casting keeps that assumption checkable instead of
          // asserted: a non-numeric `addedBy` becomes an explicit `null`,
          // which the `items` `beforeChange` hook reads as a deliberate
          // clear, rather than a value the database would reject.
          return {
            addedBy: typeof addedBy === "number" ? addedBy : null,
            gesture: resolveRelationshipId(item.gesture) as number,
            id: item.id,
          };
        }),
      },
      depth: 0,
      id: list.id,
      overrideAccess: true,
      req,
    });
  }
};
