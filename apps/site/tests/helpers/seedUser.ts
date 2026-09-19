import { getPayload } from "payload";
import config from "../../src/payload.config.js";

export const testUser = {
  email: "dev@payloadcms.com",
  password: "test",
  // The e2e specs drive /admin, which is gated on `role: "admin"`, so this
  // fixture has to be a real admin. Seeding it is legitimate: `payload.create`
  // below runs through the local API with the default `overrideAccess: true`,
  // which is the privileged path. The public REST route cannot set `role` —
  // see Users.escalation.int.test.ts.
  role: "admin" as const,
};

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config });

  // Delete existing test user if any
  await payload.delete({
    collection: "users",
    where: {
      email: {
        equals: testUser.email,
      },
    },
  });

  // Create fresh test user
  await payload.create({
    collection: "users",
    data: testUser,
  });
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config });

  await payload.delete({
    collection: "users",
    where: {
      email: {
        equals: testUser.email,
      },
    },
  });
}
