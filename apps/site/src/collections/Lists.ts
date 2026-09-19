import type { CollectionConfig } from "payload";
import { isAuthenticated } from "@/access";
import {
  isListOwnerField,
  listDeleteAccess,
  listReadAccess,
  listUpdateAccess,
} from "@/access/lists";

/**
 * A `gesture` relationship value as sent to (or stored on) an `items` row:
 * either a raw id, or — for `previousValue` rows in particular, and
 * defensively for incoming ones too — an already-populated document.
 * Shared by both halves of the `items` `beforeChange` hook below so the two
 * concerns (carry-forward, dedupe) agree on what "the same gesture" means.
 */
function resolveGestureId(gesture: unknown): number | string | undefined {
  return typeof gesture === "object" && gesture !== null && "id" in gesture
    ? (gesture as { id: number | string }).id
    : (gesture as number | string | undefined);
}

export const Lists: CollectionConfig = {
  slug: "lists",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "owner", "visibility", "updatedAt"],
  },
  access: {
    read: listReadAccess,
    create: isAuthenticated,
    update: listUpdateAccess,
    // Deliberately not listUpdateAccess: deleting a list is a strictly
    // bigger, non-undoable authority than editing its items, and an
    // anonymous edit-link holder should never have it. See
    // access/lists.ts's listDeleteAccess doc comment.
    delete: listDeleteAccess,
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "textarea" },
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "private",
      options: [
        { label: "Private", value: "private" },
        { label: "Shared", value: "shared" },
      ],
    },
    {
      name: "viewShareToken",
      type: "text",
      index: true,
      unique: true,
      // Without this, an anonymous request holding a valid edit link could
      // rotate this field via the same update that's letting it edit items,
      // and lock the owner out of their own read-only link too.
      access: { update: isListOwnerField },
    },
    {
      name: "editShareToken",
      type: "text",
      index: true,
      unique: true,
      // Same reasoning as viewShareToken, but for the token that grants
      // edit access in the first place — the more dangerous of the two to
      // let an anonymous editor rotate.
      access: { update: isListOwnerField },
    },
    {
      name: "allowSharedEditing",
      type: "checkbox",
      defaultValue: false,
      // Without this, an anonymous edit-link holder whose access the owner
      // just revoked (by flipping this to false) could flip it right back.
      access: { update: isListOwnerField },
    },
    { name: "isDefaultFavorites", type: "checkbox", defaultValue: false },
    {
      name: "items",
      type: "array",
      labels: { singular: "Gesture", plural: "Gestures" },
      fields: [
        {
          name: "gesture",
          type: "relationship",
          relationTo: "gestures",
          required: true,
        },
        {
          name: "addedBy",
          type: "relationship",
          relationTo: "users",
        },
      ],
      hooks: {
        beforeChange: [
          ({ value, previousValue }) => {
            if (!Array.isArray(value)) {
              return value;
            }

            // --- Pass 1: carry `addedBy` forward for continuing gestures.
            //
            // `addedBy` is provenance — a historical fact about who put a
            // gesture in the list — not user-editable content. A reorder
            // (or any update that resends `items` without `addedBy`, which
            // is exactly what a drag-to-reorder UI would naturally send)
            // has no business clearing it. This must run *before* dedupe
            // (pass 2): dedupe only removes later-duplicate rows by
            // position and never touches a surviving row's fields, so
            // running carry-forward first vs. second produces the same
            // final content either way, but doing it first keeps each
            // pass single-purpose — "decide what this row's addedBy
            // should be" before "decide which rows survive at all" — and
            // means pass 2 never needs to re-derive it.
            //
            // `undefined` (the caller didn't mention `addedBy` at all) is
            // what triggers carry-forward. An explicit `addedBy: null` is
            // respected as a deliberate clear and left alone: comparing
            // the *value* with `=== undefined`, not a falsy/nullish check,
            // is the whole point, since `null`, `""` and `undefined` would
            // otherwise all look the same and silently overwrite an
            // intentional clear.
            //
            // This can't be a `"addedBy" in item` presence check instead,
            // even though that's the more obvious way to ask "did the
            // caller mention this key" — verified against a real database
            // (`console.log(Object.keys(item))` from inside this hook)
            // that Payload's own Fields-level `beforeValidate` pass, which
            // runs before this `beforeChange` hook on every field of every
            // row, already assigns `siblingData[field.name] = undefined`
            // to any array row missing an optional field
            // (`beforeValidate/promise.js`'s fallback-value step, `payload`
            // 3.89.0). It can't match our incoming rows to their previous
            // counterparts to backfill a real value, because
            // `getExistingRowDoc` matches only by the row's own hidden
            // `id`, which a reorder/dedupe request never resends — so it
            // falls through to `undefined` and assigns it explicitly. That
            // means `"addedBy" in item` is `true` for *every* row by the
            // time this hook runs, whether the caller sent the key or not,
            // and only the literal value (`undefined` vs. `null` vs. a
            // real id) still carries the caller's actual intent.
            const previousAddedByByGesture = new Map<
              number | string,
              unknown
            >();
            if (Array.isArray(previousValue)) {
              for (const previousItem of previousValue) {
                const previousGestureId = resolveGestureId(
                  (previousItem as { gesture?: unknown } | undefined)?.gesture
                );
                if (
                  previousGestureId !== undefined &&
                  !previousAddedByByGesture.has(previousGestureId)
                ) {
                  previousAddedByByGesture.set(
                    previousGestureId,
                    (previousItem as { addedBy?: unknown } | undefined)?.addedBy
                  );
                }
              }
            }

            const withAddedByCarriedForward = value.map((item) => {
              const gestureId = resolveGestureId(
                (item as { gesture?: unknown } | undefined)?.gesture
              );
              const addedByIsAbsent =
                typeof item === "object" &&
                item !== null &&
                (item as { addedBy?: unknown }).addedBy === undefined;

              if (
                !addedByIsAbsent ||
                gestureId === undefined ||
                !previousAddedByByGesture.has(gestureId)
              ) {
                // Explicit value (including an explicit `null` clear), no
                // gesture to look up, or a gesture that's genuinely new to
                // this list (nothing to carry forward) — leave as sent,
                // which for a brand-new row may be nothing at all: an
                // anonymous share-link editor has no `req.user` to stamp
                // in as `addedBy`.
                return item;
              }

              return {
                ...item,
                addedBy: previousAddedByByGesture.get(gestureId),
              };
            });

            // --- Pass 2: dedupe.
            //
            // Same latent bug Task 4 found for `users.favorites`: Payload's
            // array field does not dedupe on its own, and Convex enforced
            // one row per (list, gesture) via a `by_list_gesture` index
            // plus an early return. First occurrence wins so a gesture
            // keeps its original position rather than jumping to wherever
            // a duplicate got added.
            //
            // Ambiguous case, deliberately pinned rather than special-cased
            // (see `Lists.int.test.ts`): if the *same* gesture appears
            // twice in one request — e.g. once bare (inherits addedBy from
            // pass 1) and once with an explicit `addedBy: null` — only the
            // first occurrence survives, so whichever intent the discarded
            // duplicate carried is simply dropped along with the rest of
            // that row. There's no principled way to merge two rows for
            // the same gesture into one, so "first occurrence, as decided
            // by pass 1" is the whole rule.
            const seen = new Set<number | string>();
            const deduped: typeof withAddedByCarriedForward = [];

            for (const item of withAddedByCarriedForward) {
              const gestureId = resolveGestureId(
                (item as { gesture?: unknown } | undefined)?.gesture
              );

              if (gestureId === undefined || seen.has(gestureId)) {
                continue;
              }

              seen.add(gestureId);
              deduped.push(item);
            }

            return deduped;
          },
        ],
      },
    },
  ],
};
