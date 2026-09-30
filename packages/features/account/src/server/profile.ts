/**
 * The profile (`account.me`, `account.updateProfile`): the `user` row and
 * how the user can sign in. Read straight from D1 (Better Auth keeps no
 * session cache here, so a change shows in the next session read).
 */
import { account, passkey, user } from "@smog/db";
import type { Db } from "@smog/db/client";
import { count, eq } from "drizzle-orm";
import type { Me, UpdateProfile } from "../schema";

/** The provider ids Better Auth stores in `account.provider_id`. */
const PASSWORD_PROVIDER = "credential";

export class AccountNotFoundError extends Error {
  constructor() {
    super("[account] The user does not exist");
    this.name = "AccountNotFoundError";
  }
}

/** The user's profile and sign-in methods (`AccountNotFoundError` if gone). */
export async function getMe(db: Db, userId: string): Promise<Me> {
  try {
    const [rows, accounts, passkeys] = await db.batch([
      db
        .select({
          createdAt: user.createdAt,
          email: user.email,
          emailVerified: user.emailVerified,
          id: user.id,
          image: user.image,
          locale: user.locale,
          name: user.name,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, userId)),
      db
        .select({ password: account.password, providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, userId)),
      db.select({ n: count() }).from(passkey).where(eq(passkey.userId, userId)),
    ]);
    const [row] = rows;
    if (!row) {
      throw new AccountNotFoundError();
    }
    const has = (provider: string): boolean =>
      accounts.some((entry) => entry.providerId === provider);
    return {
      ...row,
      createdAt: row.createdAt.getTime(),
      methods: {
        apple: has("apple"),
        google: has("google"),
        passkeys: passkeys[0]?.n ?? 0,
        password: accounts.some(
          (entry) =>
            entry.providerId === PASSWORD_PROVIDER && Boolean(entry.password)
        ),
      },
    };
  } catch (error) {
    if (!(error instanceof AccountNotFoundError)) {
      console.error("[account] Failed to read the profile:", error);
    }
    throw error;
  }
}

/**
 * Sets the fields sent (the name trimmed by the contract, the locale or
 * `null`) and returns the new profile. Nothing sent changes nothing.
 */
export async function updateProfile(
  db: Db,
  userId: string,
  input: UpdateProfile,
  now: Date = new Date()
): Promise<Me> {
  const changes = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.locale === undefined ? {} : { locale: input.locale }),
  };
  if (Object.keys(changes).length > 0) {
    try {
      await db
        .update(user)
        .set({ ...changes, updatedAt: now })
        .where(eq(user.id, userId));
    } catch (error) {
      console.error("[account] Failed to update the profile:", error);
      throw error;
    }
  }
  return await getMe(db, userId);
}
