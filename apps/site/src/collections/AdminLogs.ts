import type { CollectionConfig } from "payload";
import { denyAll, isAdmin } from "@/access";

/**
 * An append-only record of privileged actions: who did what, to which
 * document, and with what detail.
 *
 * Every write is denied through the API — see `denyAll`. Entries are created
 * by server-side hooks through the local API, where `overrideAccess`
 * defaults to `true`, which is the only way the trail stays worth reading:
 * an admin who can POST here can also write the entry that covers their
 * tracks.
 *
 * There is no hand-written timestamp field. Payload maintains `createdAt`
 * on every collection, and a second, hook-supplied one could disagree with
 * it. The hooks that populate this collection arrive with the flows they
 * audit, in Stage 5.
 */
export const AdminLogs: CollectionConfig = {
  slug: "admin-logs",
  admin: {
    useAsTitle: "action",
    defaultColumns: ["action", "targetType", "user", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    // Not required: a cron job or webhook acts with no user, and an entry
    // with an unknown actor is far better than no entry at all.
    { name: "user", type: "relationship", relationTo: "users", index: true },
    { name: "action", type: "text", required: true, index: true },
    // Deliberately loose `text` rather than a relationship or a select: the
    // target may live in any collection, and a log entry must survive the
    // document it describes being deleted.
    { name: "targetType", type: "text", required: true },
    { name: "targetId", type: "text", required: true },
    { name: "metadata", type: "json" },
  ],
};
