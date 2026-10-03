import { category, gesture, payment, sponsorship, user } from "@smog/db";
import type { Db } from "@smog/db/client";
import { DAY_MS } from "@smog/utils";
import { count, sql } from "drizzle-orm";
import {
  DASHBOARD_NEW_USER_DAYS,
  DASHBOARD_RECENT_AUDIT,
  type Dashboard,
} from "../schema";
import { auditEntriesQuery, toAuditEntry } from "./audit";
import { adminProcedure } from "./procedure";
import { paymentNeedsAdmin } from "./sponsorships";

/** `SUM` of a 0/1 condition, 0 for an empty table. */
function countWhere(condition: ReturnType<typeof sql>) {
  return sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;
}

/**
 * The dashboard in one D1 batch (one round trip): the catalogue, user and
 * sponsorship counts, and the newest audit entries. Admin reads come from D1, never
 * from the catalogue snapshot. A ban counts while it has not expired.
 */
export async function getDashboard(
  db: Db,
  now = Date.now()
): Promise<Dashboard> {
  const since = now - DASHBOARD_NEW_USER_DAYS * DAY_MS;
  try {
    const [gestures, categories, users, recent, statuses, refunds] =
      await db.batch([
        db
          .select({ published: count(gesture.publishedAt), total: count() })
          .from(gesture),
        db
          .select({ published: count(category.publishedAt), total: count() })
          .from(category),
        db
          .select({
            admins: countWhere(sql`${user.role} = 'admin'`),
            banned: countWhere(
              sql`${user.banned} = 1 and (${user.banExpires} is null or ${user.banExpires} > ${now})`
            ),
            last30Days: countWhere(sql`${user.createdAt} >= ${since}`),
            total: count(),
          })
          .from(user),
        auditEntriesQuery(db, {}, null, DASHBOARD_RECENT_AUDIT),
        db
          .select({ n: count(), status: sponsorship.status })
          .from(sponsorship)
          .groupBy(sponsorship.status),
        db
          .select({ n: count() })
          .from(payment)
          .where(paymentNeedsAdmin("payment")),
      ]);
    const byStatus = new Map(statuses.map((row) => [row.status, row.n]));
    const of = (status: (typeof statuses)[number]["status"]) =>
      byStatus.get(status) ?? 0;
    const gestureCounts = gestures[0] ?? { published: 0, total: 0 };
    const categoryCounts = categories[0] ?? { published: 0, total: 0 };
    return {
      categories: categoryCounts,
      gestures: {
        ...gestureCounts,
        unpublished: gestureCounts.total - gestureCounts.published,
      },
      recentAudit: recent.map(toAuditEntry),
      sponsorships: {
        awaitingPayment: of("awaiting_payment"),
        expiring: of("expiring"),
        inReview: of("in_review"),
        live: of("live"),
        refundNeeded: refunds[0]?.n ?? 0,
        renderFailed: of("render_failed"),
        rendering: of("rendering"),
      },
      users: users[0] ?? { admins: 0, banned: 0, last30Days: 0, total: 0 },
    };
  } catch (error) {
    console.error("[admin] Failed to load the dashboard:", error);
    throw error;
  }
}

/** The `dashboard` procedure of the admin router. */
export function dashboardRoutes() {
  return {
    dashboard: adminProcedure.dashboard.handler(
      async ({ context }) => await getDashboard(context.db)
    ),
  };
}
