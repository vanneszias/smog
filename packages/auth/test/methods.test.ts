import { account, passkey, session, user } from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PROFILE_NAME_MAX } from "../src/fields";
import {
  codeIn,
  cookieHeader,
  findUser,
  linkIn,
  PASSWORD,
  setup,
  uniqueEmail,
} from "./helpers";

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

/*
 * The profile has one write path, `account.updateProfile` (1..80 after
 * trim, `profileNameSchema`). Better Auth's `/update-user` accepts any
 * `name` and `image`, so it is not routed, and a user that signs up gets
 * the same name bound (`databaseHooks.user.create.before`).
 */
describe("profile writes", () => {
  const long = "a".repeat(PROFILE_NAME_MAX + 1);

  it("does not route POST /update-user", async () => {
    const ctx = setup();
    const { cookie, member } = await signedIn(ctx, []);
    const response = await ctx.call("/update-user", {
      body: { image: "https://evil.example/x.png", name: long },
      cookie,
    });
    expect(response.status).toBe(404);
    const row = await findUser(ctx.db, member.email);
    expect([row?.name, row?.image]).toEqual([member.name, member.image]);
  });

  it("refuses a sign-up name over 80 characters or empty after trim", async () => {
    const ctx = setup();
    for (const name of [long, "   "]) {
      const email = uniqueEmail();
      // biome-ignore lint/performance/noAwaitInLoops: one sign-up at a time.
      const response = await ctx.call("/sign-up/email", {
        body: { email, name, password: PASSWORD },
      });
      expect(response.status, JSON.stringify(name)).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_NAME");
      expect(await findUser(ctx.db, email)).toBeUndefined();
    }
    expect(ctx.email.sent).toEqual([]);
  });

  it("trims the sign-up name and keeps 80 characters", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const name = "b".repeat(PROFILE_NAME_MAX);
    const response = await ctx.call("/sign-up/email", {
      body: { email, name: `  ${name}  `, password: PASSWORD },
    });
    expect(response.status).toBe(200);
    expect((await findUser(ctx.db, email))?.name).toBe(name);
  });

  it("refuses a client-set image at sign-up", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    const response = await ctx.call("/sign-up/email", {
      body: {
        email,
        image: "https://evil.example/x.png",
        name: "Ada",
        password: PASSWORD,
      },
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("INVALID_IMAGE");
    expect(await findUser(ctx.db, email)).toBeUndefined();
  });

  it("bounds the name and refuses an image on a code sign-up (empty is fine)", async () => {
    const ctx = setup();
    const codeSignUp = async (extra: Record<string, unknown>) => {
      const email = uniqueEmail();
      await ctx.call("/email-otp/send-verification-otp", {
        body: { email, type: "sign-in" },
      });
      const otp = codeIn(ctx.email.sent.at(-1)?.text);
      const response = await ctx.call("/sign-in/email-otp", {
        body: { email, otp, ...extra },
      });
      return { email, response };
    };

    const tooLong = await codeSignUp({ name: long });
    expect(tooLong.response.status).toBe(400);
    expect(await findUser(ctx.db, tooLong.email)).toBeUndefined();

    const image = await codeSignUp({ image: "https://evil.example/x.png" });
    expect(image.response.status).toBe(400);
    expect(await findUser(ctx.db, image.email)).toBeUndefined();

    const empty = await codeSignUp({});
    expect(empty.response.status).toBe(200);
    expect((await findUser(ctx.db, empty.email))?.name).toBe("");
  });

  it("bounds the name a magic link signs up with", async () => {
    const ctx = setup();
    const email = uniqueEmail();
    await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email, name: long },
    });
    const verify = await ctx.call(linkIn(ctx.email.sent.at(-1)?.text));
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toContain("error=INVALID_NAME");
    expect(await findUser(ctx.db, email)).toBeUndefined();
  });
});

/*
 * `signInOnly` (the site's auth during maintenance): existing users sign
 * in as usual, but nothing creates a user, and nothing mails an address
 * that has no account.
 */
describe("signInOnly", () => {
  it("refuses sign-up by email and sends nothing", async () => {
    const ctx = setup({}, { signInOnly: true });
    const email = uniqueEmail();
    const response = await ctx.call("/sign-up/email", {
      body: { email, name: "Ada", password: PASSWORD },
    });
    expect(response.status).toBe(400);
    expect(await findUser(ctx.db, email)).toBeUndefined();
    expect(ctx.email.sent).toEqual([]);
  });

  it("mails a sign-in code to a known address only, and it signs in", async () => {
    const ctx = setup({}, { signInOnly: true });
    const unknown = await ctx.call("/email-otp/send-verification-otp", {
      body: { email: uniqueEmail(), type: "sign-in" },
    });
    expect(unknown.status).toBe(200);
    expect(ctx.email.sent).toEqual([]);

    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });
    await ctx.call("/email-otp/send-verification-otp", {
      body: { email, type: "sign-in" },
    });
    const otp = codeIn(ctx.email.sent.at(-1)?.text);
    const response = await ctx.call("/sign-in/email-otp", {
      body: { email, otp },
    });
    expect(response.status).toBe(200);
    expect(cookieHeader(response)).toContain("session_token=");
  });

  it("refuses the other code types (reset, verification)", async () => {
    const ctx = setup({}, { signInOnly: true });
    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });
    for (const type of ["forget-password", "email-verification"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one type at a time.
      const response = await ctx.call("/email-otp/send-verification-otp", {
        body: { email, type },
      });
      expect(response.status, type).toBe(403);
    }
    expect(ctx.email.sent).toEqual([]);
  });

  it("mails a magic link to a known address only, and it signs in", async () => {
    const ctx = setup({}, { signInOnly: true });
    const stranger = await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email: uniqueEmail() },
    });
    expect(stranger.status).toBe(200);
    expect(ctx.email.sent).toEqual([]);

    const email = uniqueEmail();
    await makeUser(ctx.db, { email, emailVerified: true });
    await ctx.call("/sign-in/magic-link", {
      body: { callbackURL: "/", email },
    });
    const verify = await ctx.call(linkIn(ctx.email.sent.at(-1)?.text));
    expect(verify.status).toBe(302);
    expect(cookieHeader(verify)).toContain("session_token=");
  });

  it("never creates a user, whatever the path (the create hook)", async () => {
    const ctx = setup({}, { signInOnly: true });
    const context = await ctx.auth.$context;
    const email = uniqueEmail();
    await expect(
      context.internalAdapter.createUser(
        { email, emailVerified: true, name: "Social" },
        { method: "email-otp" }
      )
    ).rejects.toMatchObject({ body: { code: "SIGN_UP_DISABLED" } });
    const rows = await ctx.db.select().from(user).where(eq(user.email, email));
    expect(rows).toEqual([]);
  });

  it("still signs in with a password", async () => {
    const open = setup();
    const email = uniqueEmail();
    await open.call("/sign-up/email", {
      body: { email, name: "Ada", password: PASSWORD },
    });
    await open.call(linkIn(open.email.sent.at(-1)?.text));

    const ctx = setup({}, { signInOnly: true });
    const response = await ctx.call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(response.status).toBe(200);
  });
});
