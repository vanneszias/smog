/**
 * The Cron Triggers (phase 6 ruling 9), in UTC, as `wrangler.jsonc`
 * `env.<env>.triggers.crons` lists them (`release-config-check` compares).
 * Pure data: the root scripts (`bun run cron <name>`) import it too.
 *
 * - `expiry`: `live`/`expiring` past `ends_at` become `expired` (J-01)
 * - `reminders`: the renewal reminder 30 days ahead (J-02)
 * - `stale`: open payments older than 24 h are settled or cancelled (J-03)
 * - `retention`: the daily purge (J-04; daily, not the spec's monthly run)
 */
export const CRON = {
  expiry: "0 0 * * *",
  reminders: "0 8 * * *",
  retention: "15 3 * * *",
  stale: "0 * * * *",
} as const;

export type CronName = keyof typeof CRON;

/** The name of a schedule (`controller.cron`), or `null` for one we do not run. */
export function cronName(cron: string): CronName | null {
  const match = Object.entries(CRON).find(([, schedule]) => schedule === cron);
  return match ? (match[0] as CronName) : null;
}
