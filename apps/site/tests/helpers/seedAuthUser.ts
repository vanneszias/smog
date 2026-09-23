import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

/**
 * Accounts for `tests/e2e/auth.spec.ts`.
 *
 * Written straight into the same local D1 the dev server under test is
 * holding, which is a race — hence `withBusyRetry`, for the same reasons
 * spelled out in `d1Retry.ts`.
 *
 * Every address is unique per run. A fixed one collides with the row a
 * previous run left behind on the `unique` email column, and a `beforeAll`
 * that throws is reported by Playwright as *skipped* rather than failed: a
 * green-looking run that tested nothing.
 */
export const AUTH_PASSWORD = "e2e-auth-password";

export function uniqueAuthEmail(prefix: string): string {
  return `e2e-${prefix}-${crypto.randomUUID()}@example.test`;
}

export async function seedAuthUser(email: string): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("create an auth e2e user", () =>
    payload.create({
      collection: "users",
      data: { email, password: AUTH_PASSWORD, role: "user" },
    })
  );
}

export async function cleanupAuthUsers(emails: string[]): Promise<void> {
  if (emails.length === 0) {
    return;
  }

  const payload = await getPayload({ config });

  await withBusyRetry("remove the auth e2e users", () =>
    payload.delete({
      collection: "users",
      where: { email: { in: emails } },
    })
  );
}
