import {
  MAINTENANCE_KV_KEY,
  MAINTENANCE_OFF,
  type MaintenanceSetting,
  nextBypassVersion,
  parseMaintenanceSetting,
} from "../schema";
import { writeAudit } from "./audit-writer";
import { markUnchanged } from "./guard";
import { type AdminDeps, adminProcedure } from "./procedure";

/**
 * KV's shortest edge cache. Without it a read uses the 60 s default; with
 * it the value is at most 30 s old at this location. KV is eventually
 * consistent: a write is usually read back at once where it was made, and
 * other locations see it within about a minute. There is no uncached read.
 */
const KV_CACHE_TTL_S = 30;

interface StoredSetting {
  /** The KV value as stored (`null`: no key), to restore it. */
  raw: string | null;
  /** Parsed; a missing or malformed value reads as off. */
  setting: MaintenanceSetting;
}

async function readSetting(kv: KVNamespace): Promise<StoredSetting> {
  const raw = await kv.get(MAINTENANCE_KV_KEY, { cacheTtl: KV_CACHE_TTL_S });
  const setting = parseMaintenanceSetting(raw);
  if (raw !== null && setting === null) {
    console.error(
      "[admin] Failed to parse the maintenance setting; treating it as off"
    );
  }
  return { raw, setting: setting ?? MAINTENANCE_OFF };
}

/** Whether `next` asks for exactly the stored state (then: a no-op). */
function isSameState(
  current: MaintenanceSetting,
  next: Pick<MaintenanceSetting, "enabled" | "message" | "until">
): boolean {
  if (current.enabled !== next.enabled) {
    return false;
  }
  return (
    !next.enabled ||
    (current.message === next.message &&
      (current.until === undefined) === (next.until === undefined) &&
      (current.until === undefined ||
        Date.parse(current.until) === Date.parse(next.until ?? "")))
  );
}

/**
 * Puts the value read before the change back (best effort) after its audit
 * entry failed, so no unaudited change stands and "not changed" is true. A
 * failed restore is logged; the caller rethrows the audit error either way.
 */
async function restoreSetting(
  kv: KVNamespace,
  raw: string | null
): Promise<void> {
  try {
    await (raw === null
      ? kv.delete(MAINTENANCE_KV_KEY)
      : kv.put(MAINTENANCE_KV_KEY, raw));
  } catch (error) {
    console.error(
      "[admin] Failed to restore the maintenance setting after a failed audit write:",
      error
    );
  }
}

/** The `maintenance` slice of the admin router (A-26, ruling 9). */
export function maintenanceRoutes(_deps: AdminDeps) {
  return {
    maintenance: {
      get: adminProcedure.maintenance.get.handler(
        async ({ context }) => (await readSetting(context.kv)).setting
      ),
      set: adminProcedure.maintenance.set.handler(
        async ({ context, input }) => {
          const { raw, setting: current } = await readSetting(context.kv);
          const until =
            input.until === undefined
              ? undefined
              : new Date(input.until).toISOString();
          if (
            isSameState(current, {
              enabled: input.enabled,
              message: input.message,
              until,
            })
          ) {
            markUnchanged(context.db);
            return current;
          }
          const next: MaintenanceSetting = {
            bypassVersion: nextBypassVersion(
              input.enabled,
              current.bypassVersion
            ),
            enabled: input.enabled,
            ...(input.message === undefined ? {} : { message: input.message }),
            ...(until === undefined ? {} : { until }),
          };
          try {
            await context.kv.put(MAINTENANCE_KV_KEY, JSON.stringify(next));
          } catch (error) {
            console.error(
              "[admin] Failed to write the maintenance setting:",
              error
            );
            throw error;
          }
          // Ruling 5, external order: the change first, then its entry. The
          // writer logs a failure; the change is then undone and the error
          // rethrown, so the admin's "not changed" is true and a retry is a
          // real, audited change.
          const window = input.enabled ? next : current;
          try {
            await writeAudit(context.db, {
              action: input.enabled
                ? "maintenance.enable"
                : "maintenance.disable",
              actorId: context.user.id,
              data: {
                message: window.message ?? null,
                until: window.until ?? null,
              },
              targetId: MAINTENANCE_KV_KEY,
              targetType: "setting",
            });
          } catch (error) {
            await restoreSetting(context.kv, raw);
            throw error;
          }
          return next;
        }
      ),
    },
  };
}
