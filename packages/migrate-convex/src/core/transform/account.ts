/**
 * The account transform (phase 8 ruling 9; carry 16 (c)): Convex
 * `user_consents` and `adminLogs` → `consent_event` and `audit_log`, in
 * `40-account`.
 *
 * - **Consents.** Each `user_consents` row becomes an `analytics` event
 *   with `granted = analyticsConsent`, and a `marketing` event with
 *   `granted = marketingConsent` when that field is set. Both get
 *   `policy_version = consentVersion`, `source = "import"` and `created_at
 *   = consentDate`. `ipAddress` and `userAgent` are dropped. Rows of a
 *   guest, of a user dropped for no email, or of an unknown user are
 *   dropped and counted.
 * - **Admin logs** become `audit_log` rows with `action = "legacy"` and
 *   `data = { legacy: { action, targetType, targetId, metadata } }`
 *   (staging scrubs `metadata` with `pseudonymiser(target).legacyMetadata`).
 *   - `target_type`: `gesture`, `category`, `sponsorship` and `user` keep
 *     theirs; anything else becomes `system` with `target_id` NULL.
 *   - `target_id` is the mapped new id, or NULL: the `legacyUuid` of a
 *     gesture, category or sponsorship the export holds (sponsorships are
 *     written after this file, and `target_id` has no foreign key), and a
 *     user through `legacyIdRef` (a claimed account keeps its own id).
 *   - `actor_id` is the mapped user (`legacyIdRef`), or NULL.
 *   - Rows older than 3 years before `--now` are dropped and counted.
 */
import type { AUDIT_TARGET_TYPES } from "@smog/admin/schema";
import { auditLog, consentEvent } from "@smog/db";
import { insertRow, legacyIdRef, type RawSql } from "../emit";
import { legacyKey, legacyUuids } from "../ids";
import type { TransformContext, TransformResult } from "../plan";
import { section } from "../report";
import { pseudonymiser } from "../target";
import { type CatalogIds, catalogIds } from "./catalog";
import { migratedLegacyId, type ResolvedUsers, resolveUsers } from "./users";

/** Admin logs older than this many years before `--now` are dropped. */
const AUDIT_RETENTION_YEARS = 3;

/** The old `targetType`s that keep their type; every other one becomes `system`. */
const KEPT_TARGET_TYPES = [
  "gesture",
  "category",
  "sponsorship",
  "user",
] as const satisfies readonly (typeof AUDIT_TARGET_TYPES)[number][];
type KeptTargetType = (typeof KEPT_TARGET_TYPES)[number];

function isKeptTargetType(value: string): value is KeptTargetType {
  return (KEPT_TARGET_TYPES as readonly string[]).includes(value);
}

/** `now` minus `AUDIT_RETENTION_YEARS` calendar years (UTC). */
export function auditCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_RETENTION_YEARS);
  return cutoff;
}

type ConsentValues = Omit<typeof consentEvent.$inferInsert, "userId"> & {
  userId: RawSql;
};
type AuditValues = Omit<
  typeof auditLog.$inferInsert,
  "actorId" | "targetId"
> & {
  actorId: RawSql | null;
  targetId: string | RawSql | null;
};

export interface AccountTransformResult extends TransformResult {
  readonly rows: {
    readonly auditLog: readonly AuditValues[];
    readonly consentEvent: readonly ConsentValues[];
  };
}

interface ConsentRows {
  drops: Record<"guest" | "noEmail" | "unknownUser", number>;
  rows: ConsentValues[];
}

async function consentRowsOf(
  context: TransformContext,
  users: ResolvedUsers
): Promise<ConsentRows> {
  const result: ConsentRows = {
    drops: { guest: 0, noEmail: 0, unknownUser: 0 },
    rows: [],
  };
  const ids = await legacyUuids(
    "consent_event",
    context.data.user_consents.flatMap((row) => [
      legacyKey(row._id, "analytics"),
      legacyKey(row._id, "marketing"),
    ])
  );
  for (const row of context.data.user_consents) {
    const resolution = users.byConvexId.get(row.userId);
    if (resolution?.kind !== "migrated") {
      result.drops[resolution?.kind ?? "unknownUser"] += 1;
      continue;
    }
    const purposes: ["analytics" | "marketing", boolean][] = [
      ["analytics", row.analyticsConsent],
    ];
    if (row.marketingConsent !== undefined) {
      purposes.push(["marketing", row.marketingConsent]);
    }
    for (const [purpose, granted] of purposes) {
      result.rows.push({
        createdAt: new Date(row.consentDate),
        granted,
        id: ids.get(legacyKey(row._id, purpose)) ?? "",
        policyVersion: row.consentVersion,
        purpose,
        source: "import",
        userId: legacyIdRef("user", resolution.legacyId),
      });
    }
  }
  return result;
}

interface AuditTargets {
  readonly catalog: CatalogIds;
  /** The export's sponsorships' new ids (`legacyUuid("sponsorship", _id)`). */
  readonly sponsorships: ReadonlyMap<string, string>;
  readonly users: ResolvedUsers;
}

/** The mapped `target_id` of a kept target type, or null. */
function targetIdOf(
  targetType: KeptTargetType,
  targetId: string,
  targets: AuditTargets
): string | RawSql | null {
  switch (targetType) {
    case "gesture":
      return targets.catalog.gestures.get(targetId) ?? null;
    case "category":
      return targets.catalog.categories.get(targetId) ?? null;
    case "sponsorship":
      return targets.sponsorships.get(targetId) ?? null;
    default: {
      const legacyId = migratedLegacyId(targets.users, targetId);
      return legacyId === null ? null : legacyIdRef("user", legacyId);
    }
  }
}

interface AuditRows {
  rows: AuditValues[];
  systemTargets: number;
  tooOld: number;
  unmappedActors: number;
  unmappedTargets: number;
}

async function auditRowsOf(
  context: TransformContext,
  targets: AuditTargets
): Promise<AuditRows> {
  const pseudo = pseudonymiser(context.target);
  const cutoff = auditCutoff(context.now).getTime();
  const kept = context.data.adminLogs.filter((row) => row.createdAt >= cutoff);
  const ids = await legacyUuids(
    "audit_log",
    kept.map((row) => row._id)
  );
  const result: AuditRows = {
    rows: [],
    systemTargets: 0,
    tooOld: context.data.adminLogs.length - kept.length,
    unmappedActors: 0,
    unmappedTargets: 0,
  };
  for (const row of kept) {
    const targetType = isKeptTargetType(row.targetType)
      ? row.targetType
      : "system";
    const targetId =
      targetType === "system"
        ? null
        : targetIdOf(targetType, row.targetId, targets);
    result.systemTargets += targetType === "system" ? 1 : 0;
    result.unmappedTargets +=
      targetType !== "system" && targetId === null ? 1 : 0;
    const actor = migratedLegacyId(targets.users, row.userId);
    result.unmappedActors += actor === null ? 1 : 0;
    result.rows.push({
      action: "legacy",
      actorId: actor === null ? null : legacyIdRef("user", actor),
      createdAt: new Date(row.createdAt),
      data: {
        legacy: {
          action: row.action,
          metadata: pseudo.legacyMetadata(row.metadata),
          targetId: row.targetId,
          targetType: row.targetType,
        },
      },
      id: ids.get(row._id) ?? "",
      targetId,
      targetType,
    });
  }
  return result;
}

/** The `40-account` transform (see the module comment). */
export async function accountTransform(
  context: TransformContext
): Promise<AccountTransformResult> {
  const users = await resolveUsers(context);
  const consents = await consentRowsOf(context, users);
  const audit = await auditRowsOf(context, {
    catalog: await catalogIds(context),
    sponsorships: await legacyUuids(
      "sponsorship",
      context.data.sponsorships.map((row) => row._id)
    ),
    users,
  });
  return {
    group: "40-account",
    resetKeys: {
      rows: {
        audit_log: audit.rows.map((row) => row.id),
        consent_event: consents.rows.map((row) => row.id),
      },
    },
    rows: { auditLog: audit.rows, consentEvent: consents.rows },
    sections: [
      section(
        "account",
        {
          auditLogs: audit.rows.length,
          auditLogsDroppedTooOld: audit.tooOld,
          auditLogsSystemTarget: audit.systemTargets,
          auditLogsUnmappedActor: audit.unmappedActors,
          auditLogsUnmappedTarget: audit.unmappedTargets,
          consentEvents: consents.rows.length,
          consentRowsDroppedGuest: consents.drops.guest,
          consentRowsDroppedNoEmail: consents.drops.noEmail,
          consentRowsDroppedUnknownUser: consents.drops.unknownUser,
        },
        audit.tooOld > 0
          ? [
              {
                code: "auditTooOld",
                count: audit.tooOld,
                message: `${audit.tooOld} admin log row(s) are older than ${AUDIT_RETENTION_YEARS} years and are not migrated.`,
                severity: "info",
              },
            ]
          : []
      ),
    ],
    statements: [
      ...consents.rows.map((row) =>
        insertRow(consentEvent, row, [[consentEvent.id]])
      ),
      ...audit.rows.map((row) => insertRow(auditLog, row, [[auditLog.id]])),
    ],
  };
}
