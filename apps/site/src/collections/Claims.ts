import type { CollectionConfig } from "payload";
import { denyAll, isAdmin } from "@/access";
import { CLAIM_KIND_VALUES } from "@/lib/claims";

/**
 * One row per unit of work this application has taken responsibility for. The
 * unique `key` is the lock.
 *
 * This replaces `webhook-deliveries` (Stage 5) and `render-completions`
 * (Stage 6), which were the same table twice. `lib/claims.ts` carries the
 * reasoning those two collections' doc blocks carried — why a unique index is
 * the only atomic primitive here, why the key is namespaced by kind, and why a
 * lease and a receipt are the same row with and without an expiry. This file
 * is only the shape.
 *
 * ## Why it is one table now and was two before
 *
 * `RenderCompletions.ts` deferred this deliberately: doing it at Stage 6 would
 * have meant editing Stage 5's shipped and mutation-proven webhook mid-stage to
 * serve an abstraction with two users. There are four now, so the merge is
 * done once — and the proof that it did not break anything is that Stage 5's
 * and Stage 6's concurrency mutations still fail their own tests through this
 * table.
 *
 * ## Access
 *
 * Admin-only read; nothing may be written over the API at all, exactly as for
 * the two collections it replaces. The only legitimate writers are the
 * endpoints, going through the local API with `overrideAccess: true`. A lock
 * anyone can POST to or delete is not a lock.
 */
export const Claims: CollectionConfig = {
  slug: "claims",
  admin: {
    useAsTitle: "key",
    defaultColumns: ["key", "kind", "expiresAt", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    // The whole point of the collection. `unique` is not an optimisation and
    // not a data-quality nicety: it is the only atomic operation this database
    // offers, and removing it silently turns every consumer back into
    // read-then-write — one payment advanced twice, and two Mux assets for one
    // render, one of which nobody can name and everybody keeps paying for.
    //
    // The value is `${kind}:${key}`, never the caller's string on its own.
    {
      name: "key",
      type: "text",
      required: true,
      index: true,
      unique: true,
    },
    // Denormalised out of `key`, and worth the redundancy: it is what makes
    // the admin list readable and what a per-kind sweep would filter on. It is
    // not what enforces the namespacing — the composite `key` is.
    {
      name: "kind",
      type: "select",
      required: true,
      index: true,
      options: CLAIM_KIND_VALUES,
    },
    // Null means "kept for ever": a receipt that the work was done, not a
    // lease on work in progress. Only `job-run` sets it. A `render-completion`
    // row that expired would let a replayed Lambda callback create a second
    // Mux asset, which is a monthly bill rather than a stray row — see
    // `lib/claims.ts`.
    {
      name: "expiresAt",
      type: "date",
      index: true,
    },
  ],
};
