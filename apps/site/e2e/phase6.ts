/**
 * Parts of the sponsor e2e that wait for a later phase 6 task (review
 * I-6). A flag skips its test only while the procedure is still the task 3
 * stub (`INTERNAL_SERVER_ERROR` "not implemented"); once the procedure is
 * real, the test fails until its flag is removed here, so the task that
 * merges it turns the test on. (`adminQueue` went with task 6: the paid
 * test now checks the admin review queue.) Any other answer (a 500 from a broken
 * implementation included) runs the test. `packages/features/sponsorships/
 * src/phase6-pending.test.ts` fails while this object exists after
 * PROGRESS marks phase 6 done; task 9 deletes it.
 */
export type Phase6Pending = "checkout" | "reedit";

export const PHASE6_PENDING: Readonly<Record<Phase6Pending, boolean>> = {
  /** Task 4: checkout, payment status, the webhook, the fake render. */
  checkout: false,
  /** Task 5: `reedit.get` / `reedit.submit`. */
  reedit: false,
};
