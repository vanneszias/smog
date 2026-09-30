import { account, passkey, session } from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { codeIn, cookieHeader, setup, uniqueEmail } from "./helpers";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

type Ctx = ReturnType<typeof setup>;

/** A verified user with the given provider accounts, signed in by code. */
async function signedIn(ctx: Ctx, providers: string[]) {
  const email = uniqueEmail();
  const member = await makeUser(ctx.db, { email, emailVerified: true });
  const rows = providers.map((providerId) => ({
    accountId: newId(),
    id: newId(),
    providerId,
    userId: member.id,
  }));
  if (rows.length > 0) {
    await ctx.db.insert(account).values(rows);
  }
  await ctx.call("/email-otp/send-verification-otp", {
    body: { email, type: "sign-in" },
  });
  const otp = codeIn(ctx.email.sent.at(-1)?.text);
  const response = await ctx.call("/sign-in/email-otp", {
    body: { email, otp },
  });
  expect(response.status).toBe(200);
  return { accounts: rows, cookie: cookieHeader(response), member };
}

async function errorCode(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

/*
 * The account screens disable Unlink for the last account (`canUnlink`),
 * but the rule lives in Better Auth: these pin it, so a config change
 * (`allowUnlinkingAll`) or an upgrade cannot silently drop it.
 */
describe("unlinking a provider", () => {
  it("refuses the last account (FAILED_TO_UNLINK_LAST_ACCOUNT)", async () => {
    const ctx = setup();
    const { accounts, cookie } = await signedIn(ctx, ["google"]);
    const response = await ctx.call("/unlink-account", {
      body: { accountId: accounts[0]?.id },
      cookie,
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT");
    const left = await ctx.db
      .select()
      .from(account)
      .where(eq(account.id, accounts[0]?.id ?? ""));
    expect(left).toHaveLength(1);
  });

  it("unlinks one of two, then refuses the other", async () => {
    const ctx = setup();
    const { accounts, cookie } = await signedIn(ctx, ["google", "apple"]);
    const [google, apple] = accounts;
    const first = await ctx.call("/unlink-account", {
      body: { accountId: google?.id },
      cookie,
    });
    expect(first.status).toBe(200);
    const second = await ctx.call("/unlink-account", {
      body: { accountId: apple?.id },
      cookie,
    });
    expect(second.status).toBe(400);
  });

  it("needs a fresh session (SESSION_NOT_FRESH)", async () => {
    const ctx = setup();
    const { accounts, cookie, member } = await signedIn(ctx, [
      "google",
      "apple",
    ]);
    await ctx.db
      .update(session)
      .set({ createdAt: new Date(Date.now() - TWO_DAYS_MS) })
      .where(eq(session.userId, member.id));
    const response = await ctx.call("/unlink-account", {
      body: { accountId: accounts[0]?.id },
      cookie,
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("SESSION_NOT_FRESH");
  });
});

describe("removing a passkey", () => {
  it("refuses another user's passkey and keeps it", async () => {
    const ctx = setup();
    const owner = await makeUser(ctx.db, {
      email: uniqueEmail(),
      emailVerified: true,
    });
    const id = newId();
    await ctx.db.insert(passkey).values({
      backedUp: false,
      counter: 0,
      credentialID: newId(),
      deviceType: "singleDevice",
      id,
      publicKey: "key",
      userId: owner.id,
    });
    const { cookie } = await signedIn(ctx, []);
    const response = await ctx.call("/passkey/delete-passkey", {
      body: { id },
      cookie,
    });
    expect(response.ok).toBe(false);
    const left = await ctx.db.select().from(passkey).where(eq(passkey.id, id));
    expect(left).toHaveLength(1);
  });
});
