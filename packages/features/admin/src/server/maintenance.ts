import {
  MAINTENANCE_KV_KEY,
  MAINTENANCE_OFF,
  type MaintenanceSetting,
  nextBypassVersion,
  parseMaintenanceSetting,
} from "../schema";
import { markUnchanged, writeAudit } from "./audit-writer";
import { type AdminDeps, adminProcedure } from "./procedure";

/** The stored setting, read with no cache; a malformed value reads as off. */
async function readSetting(kv: KVNamespace): Promise<MaintenanceSetting> {
  const raw = await kv.get(MAINTENANCE_KV_KEY);
  const setting = parseMaintenanceSetting(raw);
  if (raw !== null && setting === null) {
    console.error(
      "[admin] Failed to parse the maintenance setting; treating it as off"
    );
  }
  return setting ?? MAINTENANCE_OFF;
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
        next.until === undefined ||
        Date.parse(current.until) === Date.parse(next.until)))
  );
}

/** The `maintenance` slice of the admin router (A-26, ruling 9). */
export function maintenanceRoutes(_deps: AdminDeps) {
  return {
    maintenance: {
      get: adminProcedure.maintenance.get.handler(({ context }) =>
        readSetting(context.kv)
      ),
      set: adminProcedure.maintenance.set.handler(
        async ({ context, input }) => {
          const current = await readSetting(context.kv);
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
          // Ruling 5, external order: the change first, then its entry (a
          // failure is logged and rethrown by the writer).
          const window = input.enabled ? next : current;
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
          return next;
        }
      ),
    },
  };
}
