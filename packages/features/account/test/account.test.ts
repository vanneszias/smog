import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXPORT_VERSION,
  accountExportSchema,
  setConsentInputSchema,
} from "../src/schema";
import {
  createAccountRouter,
  exportAccount,
  getConsent,
  getMe,
  setConsent,
  updateProfile,
} from "../src/server";
import { accountDeps } from "./deps";
import {
  type AuthedUser,
  addGestures,
  addList,
  addUser,
  authedContext,
  contextFor,
  count,
  PASSWORD,
  passwordlessUser,
  SITE_URL,
  signedUpUser,
  signIn,
  storedConsent,
  testDb,
} from "./helpers";

const NOW = new Date("2026-09-29T12:00:00Z");
const accountRouter = createAccountRouter(accountDeps);

async function addConsent(
  userId: string,
  granted: boolean,
  createdAt: number,
  options: { policyVersion?: string; purpose?: string; source?: string } = {}
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO consent_event (id, user_id, purpose, granted, policy_version, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      crypto.randomUUID(),
      userId,
      options.purpose ?? "analytics",
      granted ? 1 : 0,
      options.policyVersion ?? CONSENT_POLICY_VERSION,
      options.source ?? "web",
      createdAt
    )
    .run();
}

async function addShare(
  listId: string,
  role: "view" | "edit",
  token: string,
  options: { createdAt?: number; revokedAt?: number | null } = {}
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO list_share (id, list_id, role, token, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(
      crypto.randomUUID(),
      listId,
      role,
      token,
      options.createdAt ?? 2000,
      options.revokedAt ?? null
    )
    .run();
}

async function addAccount(
  userId: string,
  providerId: string,
  createdAt = 1000
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, created_at, updated_at) VALUES (?, ?, ?, ?, 'secret-access', 'secret-refresh', 'secret-id', ?, ?)"
  )
    .bind(
      crypto.randomUUID(),
      `${providerId}-${userId}`,
      providerId,
      userId,
      createdAt,
      createdAt
    )
    .run();
}

async function addPasskey(userId: string, name: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) VALUES (?, ?, 'secret-public-key', ?, 'secret-credential-id', 0, 'multiDevice', 1, 3000)"
  )
    .bind(crypto.randomUUID(), name, userId)
    .run();
}

/** A checkout (sponsor, optional invoice, one sponsorship, a paid payment). */
async function addSponsorship(
  email: string,
  gestureId: string,
  options: { invoice?: boolean; status?: string } = {}
): Promise<{ molliePaymentId: string; paymentId: string; sponsorId: string }> {
  const sponsorId = crypto.randomUUID();
  const sponsorshipId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const molliePaymentId = `tr_${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sponsor (id, name, email, company, locale, created_at) VALUES (?, 'Sofie Sponsor', ?, 'Bakkerij Sofie', 'nl', 4000)"
    ).bind(sponsorId, email),
    ...(options.invoice
      ? [
          env.DB.prepare(
            "INSERT INTO invoice_request (sponsor_id, name, vat_number, email) VALUES (?, 'Bakkerij Sofie BV', 'BE0123456749', 'factuur@sofie.test')"
          ).bind(sponsorId),
        ]
      : []),
    env.DB.prepare(
      "INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, logo_key, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, 'Bakkerij Sofie', 'logos/secret.png', ?, 5000, 6000, 4000, 5000)"
    ).bind(sponsorshipId, sponsorId, gestureId, options.status ?? "live"),
    env.DB.prepare(
      "INSERT INTO payment (id, mollie_id, kind, status, amount_cents, currency, checkout_url, paid_at, created_at, updated_at) VALUES (?, ?, 'initial', 'paid', 6000, 'EUR', 'https://mollie.test/checkout', 4500, 4000, 4500)"
    ).bind(paymentId, molliePaymentId),
    env.DB.prepare(
      "INSERT INTO payment_item (payment_id, sponsorship_id, amount_cents, includes_logo) VALUES (?, ?, 6000, 1)"
    ).bind(paymentId, sponsorshipId),
  ]);
  return { molliePaymentId, paymentId, sponsorId };
}

describe("account.me", () => {
  it("returns the profile and the sign-in methods", async () => {
    const owner = await addUser("Anna");
    await env.DB.prepare(
      "UPDATE user SET locale = 'fr', email_verified = 1, created_at = 1234 WHERE id = ?"
    )
      .bind(owner.id)
      .run();
    await addAccount(owner.id, "google");
    await addPasskey(owner.id, "Laptop");
    await addPasskey(owner.id, "Telefoon");

    expect(await getMe(testDb(), owner.id)).toEqual({
      createdAt: 1234,
      email: owner.email,
      emailVerified: true,
      id: owner.id,
      image: null,
      locale: "fr",
      methods: { apple: false, google: true, passkeys: 2, password: false },
      name: "Anna",
      role: "user",
    });
  });

  it("counts a password only for a credential account that has one", async () => {
    const { user } = await signedUpUser();
    const other = await addUser();
    await addAccount(other.id, "credential");

    expect((await getMe(testDb(), user.id)).methods.password).toBe(true);
    expect((await getMe(testDb(), other.id)).methods.password).toBe(false);
  });

  it("needs a session", async () => {
    await expect(
      call(accountRouter.me, undefined, contextFor(null))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("account.updateProfile", () => {
  it("changes only the fields sent", async () => {
    const owner = await addUser("Anna");

    const me = await updateProfile(
      testDb(),
      owner.id,
      { name: "Anna Peeters" },
      NOW
    );
    expect(me).toMatchObject({ locale: null, name: "Anna Peeters" });

    const again = await updateProfile(
      testDb(),
      owner.id,
      { locale: "en" },
      NOW
    );
    expect(again).toMatchObject({ locale: "en", name: "Anna Peeters" });
    const row = await env.DB.prepare(
      "SELECT updated_at AS updatedAt FROM user WHERE id = ?"
    )
      .bind(owner.id)
      .first<{ updatedAt: number }>();
    expect(row?.updatedAt).toBe(NOW.getTime());

    expect(
      await updateProfile(testDb(), owner.id, { locale: null }, NOW)
    ).toMatchObject({ locale: null, name: "Anna Peeters" });
  });

  it("trims the name through the contract", async () => {
    const owner = await addUser("Anna");
    const me = await call(
      accountRouter.updateProfile,
      { name: "  Bert  " },
      contextFor(owner)
    );
    expect(me.name).toBe("Bert");
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["an unknown locale", { locale: "de" }],
  ])("rejects %s", async (_label, input) => {
    const owner = await addUser("Anna");
    await expect(
      call(
        accountRouter.updateProfile,
        input as { name?: string },
        contextFor(owner)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getMe(testDb(), owner.id)).name).toBe("Anna");
  });
});

describe("account.consent", () => {
  it("is undecided without rows", async () => {
    const owner = await addUser();
    expect(await getConsent(testDb(), owner.id)).toEqual({
      analytics: null,
      decidedAt: null,
      needsDecision: true,
      policyVersion: null,
    });
  });

  it("asks again after a policy change only when the old decision was yes", async () => {
    const yes = await addUser();
    const no = await addUser();
    await addConsent(yes.id, true, 1000, { policyVersion: "2020-01-01" });
    await addConsent(no.id, false, 1000, { policyVersion: "2020-01-01" });

    expect(await getConsent(testDb(), yes.id)).toEqual({
      analytics: true,
      decidedAt: 1000,
      needsDecision: true,
      policyVersion: "2020-01-01",
    });
    expect(await getConsent(testDb(), no.id)).toMatchObject({
      analytics: false,
      needsDecision: false,
    });
  });

  it("appends every decision and answers with the newest", async () => {
    const owner = await addUser();

    const first = await setConsent(
      testDb(),
      owner.id,
      setConsentInputSchema.parse({ analytics: true }),
      NOW
    );
    const later = new Date(NOW.getTime() + 1000);
    const second = await setConsent(
      testDb(),
      owner.id,
      setConsentInputSchema.parse({ analytics: false, source: "mobile" }),
      later
    );

    expect(first).toEqual({
      analytics: true,
      decidedAt: NOW.getTime(),
      needsDecision: false,
      policyVersion: CONSENT_POLICY_VERSION,
    });
    expect(second).toEqual({
      analytics: false,
      decidedAt: later.getTime(),
      needsDecision: false,
      policyVersion: CONSENT_POLICY_VERSION,
    });
    expect(await getConsent(testDb(), owner.id)).toEqual(second);
    expect(await storedConsent(owner.id)).toEqual([
      {
        createdAt: NOW.getTime(),
        granted: 1,
        policyVersion: CONSENT_POLICY_VERSION,
        purpose: "analytics",
        source: "web",
      },
      {
        createdAt: later.getTime(),
        granted: 0,
        policyVersion: CONSENT_POLICY_VERSION,
        purpose: "analytics",
        source: "mobile",
      },
    ]);
  });

  it("does not append a decision that repeats the current one", async () => {
    const owner = await addUser();
    const first = await setConsent(
      testDb(),
      owner.id,
      { analytics: true, source: "web" },
      NOW
    );
    const again = await setConsent(
      testDb(),
      owner.id,
      { analytics: true, source: "mobile" },
      new Date(NOW.getTime() + 1000)
    );
    expect(again).toEqual(first);
    expect(await storedConsent(owner.id)).toHaveLength(1);

    // A change is appended; so is a repeat after a policy change.
    await setConsent(testDb(), owner.id, { analytics: false, source: "web" });
    expect(await storedConsent(owner.id)).toHaveLength(2);
    const stale = await addUser();
    await addConsent(stale.id, true, 1000, { policyVersion: "2020-01-01" });
    await setConsent(testDb(), stale.id, { analytics: true, source: "web" });
    expect(await storedConsent(stale.id)).toHaveLength(2);
  });

  it("limits appends per user with RL_AUTH, and a repeat costs nothing", async () => {
    const owner = await addUser();
    const keys: string[] = [];
    const call$ = contextFor(owner);
    call$.context.env = {
      ...call$.context.env,
      RL_AUTH: {
        limit: ({ key }: { key: string }) => {
          keys.push(key);
          return Promise.resolve({ success: keys.length < 2 });
        },
      },
    };
    await call(accountRouter.consent.set, { analytics: true }, call$);
    // The same decision again: no row, no limit spent.
    await call(accountRouter.consent.set, { analytics: true }, call$);
    expect(keys).toEqual([`user:${owner.id}:account.consent.set`]);
    await expect(
      call(accountRouter.consent.set, { analytics: false }, call$)
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await storedConsent(owner.id)).toHaveLength(1);
  });

  it("the later of two decisions in the same millisecond wins", async () => {
    const owner = await addUser();
    await setConsent(
      testDb(),
      owner.id,
      { analytics: true, source: "web" },
      NOW
    );
    await setConsent(
      testDb(),
      owner.id,
      { analytics: false, source: "web" },
      NOW
    );
    expect((await getConsent(testDb(), owner.id)).analytics).toBe(false);
  });

  it("ignores other purposes and other users", async () => {
    const owner = await addUser();
    const other = await addUser();
    await addConsent(owner.id, false, 1000, { policyVersion: "2020-01-01" });
    await addConsent(owner.id, true, 2000, { purpose: "marketing" });
    await addConsent(other.id, true, 3000);

    expect(await getConsent(testDb(), owner.id)).toEqual({
      analytics: false,
      decidedAt: 1000,
      needsDecision: false,
      policyVersion: "2020-01-01",
    });
  });

  it("goes through the router for the signed-in user", async () => {
    const owner = await addUser();
    await call(
      accountRouter.consent.set,
      { analytics: true },
      contextFor(owner)
    );
    expect(
      await call(accountRouter.consent.get, undefined, contextFor(owner))
    ).toMatchObject({ analytics: true });
    await expect(
      call(accountRouter.consent.get, undefined, contextFor(null))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("account.export", () => {
  it("is rate-limited per user with RL_AUTH", async () => {
    const owner = await addUser();
    const keys: string[] = [];
    const call$ = contextFor(owner);
    call$.context.env = {
      ...call$.context.env,
      RL_AUTH: {
        limit: ({ key }: { key: string }) => {
          keys.push(key);
          return Promise.resolve({ success: false });
        },
      },
    };
    await expect(
      call(accountRouter.export, undefined, call$)
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(keys).toEqual([`user:${owner.id}:account.export`]);
  });

  it("contains everything about the user, and nothing secret", async () => {
    const { user } = await signedUpUser("Sofie");
    const [aap, beer] = await addGestures(["Aap", "Beer"]);
    const [hidden] = await addGestures(["Verborgen"], { published: false });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO favorite (user_id, gesture_id, created_at) VALUES (?, ?, 1000), (?, ?, 2000)"
      ).bind(user.id, aap, user.id, hidden),
    ]);
    const listId = await addList(user.id, "Dieren", [
      beer as string,
      aap as string,
    ]);
    await addShare(listId, "view", "view-token");
    await addShare(listId, "edit", "old-edit-token", { revokedAt: 2500 });
    await addConsent(user.id, true, 1500, { source: "import" });
    await addConsent(user.id, false, 2500);
    await addPasskey(user.id, "Laptop");
    const mine = await addSponsorship(user.email, aap as string, {
      invoice: true,
    });
    const theirs = await addSponsorship("someone@else.test", beer as string);
    // A previous, finished checkout with the same email, in another case.
    await addSponsorship(user.email.toUpperCase(), beer as string, {
      status: "expired",
    });

    const data = await exportAccount(
      { ...accountDeps, db: testDb(), siteUrl: SITE_URL },
      user.id,
      NOW
    );

    expect(accountExportSchema.parse(data)).toEqual(data);
    expect(data).toMatchObject({
      consent: [
        {
          createdAt: new Date(1500).toISOString(),
          granted: true,
          policyVersion: CONSENT_POLICY_VERSION,
          purpose: "analytics",
          source: "import",
        },
        { granted: false, source: "web" },
      ],
      exportedAt: NOW.toISOString(),
      exportVersion: ACCOUNT_EXPORT_VERSION,
      favorites: [
        { addedAt: new Date(2000).toISOString(), gesture: { id: hidden } },
        {
          addedAt: new Date(1000).toISOString(),
          gesture: { id: aap, name: "Aap" },
        },
      ],
      lists: [
        {
          description: null,
          id: listId,
          items: [
            { gesture: { id: beer, name: "Beer" }, position: 0 },
            { gesture: { id: aap, name: "Aap" }, position: 1 },
          ],
          name: "Dieren",
          shareLinks: [
            {
              createdAt: new Date(2000).toISOString(),
              role: "view",
              url: `${SITE_URL}/lists/view-token`,
            },
          ],
        },
      ],
      profile: {
        email: user.email,
        emailVerified: true,
        id: user.id,
        name: "Sofie",
        role: "user",
      },
      signInMethods: {
        passkeys: [{ createdAt: new Date(3000).toISOString(), name: "Laptop" }],
        providers: [{ provider: "credential" }],
      },
    });
    expect(data.sponsorships).toHaveLength(2);
    expect(data.sponsorships[0]).toEqual({
      contact: {
        company: "Bakkerij Sofie",
        email: user.email,
        locale: "nl",
        name: "Sofie Sponsor",
      },
      createdAt: new Date(4000).toISOString(),
      invoice: {
        email: "factuur@sofie.test",
        name: "Bakkerij Sofie BV",
        vatNumber: "BE0123456749",
      },
      items: [
        {
          createdAt: new Date(4000).toISOString(),
          displayName: "Bakkerij Sofie",
          endsAt: new Date(6000).toISOString(),
          gesture: { id: aap, name: "Aap", slug: expect.any(String) },
          hasLogo: true,
          startsAt: new Date(5000).toISOString(),
          status: "live",
          updatedAt: new Date(5000).toISOString(),
        },
      ],
    });
    expect(data.sponsorships[1]?.items[0]?.status).toBe("expired");

    const text = JSON.stringify(data);
    for (const secret of [
      mine.molliePaymentId,
      mine.paymentId,
      mine.sponsorId,
      theirs.molliePaymentId,
      "someone@else.test",
      "old-edit-token",
      "secret",
      "mollie.test",
      "amount",
    ]) {
      expect(text).not.toContain(secret);
    }
    const hash = await env.DB.prepare(
      "SELECT password FROM account WHERE user_id = ?"
    )
      .bind(user.id)
      .first<{ password: string }>();
    expect(hash?.password).toBeTruthy();
    expect(text).not.toContain(hash?.password as string);
  });

  it("has empty sections for a user without data", async () => {
    const owner = await addUser("Leeg");

    const data = await exportAccount(
      { ...accountDeps, db: testDb(), siteUrl: SITE_URL },
      owner.id,
      NOW
    );

    expect(accountExportSchema.parse(data)).toEqual(data);
    expect(data).toEqual({
      consent: [],
      exportedAt: NOW.toISOString(),
      exportVersion: 2,
      favorites: [],
      lists: [],
      profile: {
        createdAt: expect.any(String),
        email: owner.email,
        emailVerified: false,
        id: owner.id,
        image: null,
        locale: null,
        name: "Leeg",
        role: "user",
      },
      signInMethods: { passkeys: [], providers: [] },
      sponsorships: [],
    });
  });

  it("leaves out sponsorships while the email is not verified", async () => {
    const owner = await addUser();
    const [aap] = await addGestures(["Aap"]);
    await addSponsorship(owner.email, aap as string);

    const data = await exportAccount(
      { ...accountDeps, db: testDb(), siteUrl: SITE_URL },
      owner.id,
      NOW
    );

    expect(data.sponsorships).toEqual([]);
  });

  it("goes through the router for the signed-in user", async () => {
    const owner = await addUser("Anna");
    const data = await call(accountRouter.export, undefined, contextFor(owner));
    expect(data.profile.id).toBe(owner.id);
  });
});

describe("account.delete", () => {
  async function seedEverything(userId: string, email: string) {
    const [aap, beer] = await addGestures(["Aap", "Beer"]);
    const other = await addUser("Bert");
    await env.DB.prepare(
      "INSERT INTO favorite (user_id, gesture_id, created_at) VALUES (?, ?, 1000)"
    )
      .bind(userId, aap)
      .run();
    const listId = await addList(userId, "Dieren", [aap as string]);
    await addShare(listId, "view", `token-${listId}`);
    // An item this user added to someone else's list (shared for editing).
    const otherList = await addList(other.id, "Van Bert");
    await env.DB.prepare(
      "INSERT INTO list_item (list_id, gesture_id, position, added_by, created_at) VALUES (?, ?, 0, ?, 1000)"
    )
      .bind(otherList, beer, userId)
      .run();
    await addConsent(userId, true, 1000);
    await addPasskey(userId, "Laptop");
    await addAccount(userId, "google");
    const auditId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, ?, 'gesture.update', 'gesture', ?, '{}', 1000)"
    )
      .bind(auditId, userId, aap)
      .run();
    await addSponsorship(email, aap as string);
    return { auditId, listId, otherList };
  }

  it("deletes the user's data, ends every session and keeps sponsorships", async () => {
    const authed = await signedUpUser();
    const { user } = authed;
    // A second device (or tab) with its own session.
    const otherCookie = await signIn(authed.auth, user.email);
    const { auditId, listId, otherList } = await seedEverything(
      user.id,
      user.email
    );

    const result = await call(
      accountRouter.delete,
      { confirm: "DELETE", password: PASSWORD },
      await authedContext(authed)
    );

    expect(result).toEqual({ deleted: true });
    const tables = [
      ["user", "id"],
      ["session", "user_id"],
      ["account", "user_id"],
      ["passkey", "user_id"],
      ["favorite", "user_id"],
      ["list", "owner_id"],
      ["consent_event", "user_id"],
    ] as const;
    const left = await Promise.all(
      tables.map(async ([table, column]) => [
        table,
        await count(
          `SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`,
          user.id
        ),
      ])
    );
    expect(left).toEqual(tables.map(([table]) => [table, 0]));
    expect(
      await count(
        "SELECT count(*) AS n FROM list_item WHERE list_id = ?",
        listId
      )
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM list_share WHERE list_id = ?",
        listId
      )
    ).toBe(0);
    // Other people's rows stay, without the reference.
    expect(
      await count(
        "SELECT count(*) AS n FROM list_item WHERE list_id = ? AND added_by IS NULL",
        otherList
      )
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM audit_log WHERE id = ? AND actor_id IS NULL",
        auditId
      )
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM sponsor WHERE email = ?",
        user.email
      )
    ).toBe(1);

    const sessions = await Promise.all(
      [authed.cookie, otherCookie].map((cookie) =>
        authed.auth.api.getSession({ headers: new Headers({ cookie }) })
      )
    );
    expect(sessions).toEqual([null, null]);
  });

  it.each([
    ["the IP", "192.0.2.1:account.delete"],
    ["the user", "user:"],
  ])("is rate-limited per %s with RL_AUTH", async (_label, limited) => {
    const authed = await signedUpUser();
    const keys: string[] = [];
    const RL_AUTH = {
      limit: ({ key }: { key: string }) => {
        keys.push(key);
        return Promise.resolve({ success: !key.startsWith(limited) });
      },
    };
    await expect(
      call(
        accountRouter.delete,
        { confirm: "DELETE", password: PASSWORD },
        await authedContext(authed, { RL_AUTH })
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(keys.sort()).toEqual([
      "192.0.2.1:account.delete",
      `user:${authed.user.id}:account.delete`,
    ]);
    expect(
      await count("SELECT count(*) AS n FROM user WHERE id = ?", authed.user.id)
    ).toBe(1);
  });

  it("needs the password of an account that has one, even on a fresh session", async () => {
    const authed = await signedUpUser();
    await expect(
      call(
        accountRouter.delete,
        { confirm: "DELETE" },
        await authedContext(authed)
      )
    ).rejects.toMatchObject({ code: "PASSWORD_REQUIRED", status: 400 });
    expect(
      await count("SELECT count(*) AS n FROM user WHERE id = ?", authed.user.id)
    ).toBe(1);
  });

  it("deletes an account without a password on a fresh session", async () => {
    const authed = await passwordlessUser();
    expect(
      await call(
        accountRouter.delete,
        { confirm: "DELETE" },
        await authedContext(authed)
      )
    ).toEqual({ deleted: true });
    expect(
      await count("SELECT count(*) AS n FROM user WHERE id = ?", authed.user.id)
    ).toBe(0);
  });

  it("needs the word DELETE", async () => {
    const authed = await signedUpUser();
    await expect(
      call(
        accountRouter.delete,
        { confirm: "delete" } as unknown as { confirm: "DELETE" },
        await authedContext(authed)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await count("SELECT count(*) AS n FROM user WHERE id = ?", authed.user.id)
    ).toBe(1);
  });

  it("needs a session", async () => {
    await expect(
      call(accountRouter.delete, { confirm: "DELETE" }, contextFor(null))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  describe("the last admin (ruling 7)", () => {
    async function asAdmin(authed: AuthedUser): Promise<AuthedUser> {
      await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?")
        .bind(authed.user.id)
        .run();
      return authed;
    }

    it("refuses the only admin not under a ban (INVALID_STATE), and keeps the account", async () => {
      const only = await asAdmin(await signedUpUser("Ada"));
      // Another admin whose ban is in force does not count.
      const banned = await asAdmin(await signedUpUser("Bea"));
      await env.DB.prepare(
        "UPDATE user SET banned = 1, ban_reason = 'x' WHERE id = ?"
      )
        .bind(banned.user.id)
        .run();
      await expect(
        call(
          accountRouter.delete,
          { confirm: "DELETE", password: PASSWORD },
          await authedContext(only)
        )
      ).rejects.toMatchObject({ code: "INVALID_STATE", status: 409 });
      expect(
        await count("SELECT count(*) AS n FROM user WHERE id = ?", only.user.id)
      ).toBe(1);

      // With a second admin in good standing, the first one can leave.
      const second = await asAdmin(await signedUpUser("Cas"));
      expect(
        await call(
          accountRouter.delete,
          { confirm: "DELETE", password: PASSWORD },
          await authedContext(only)
        )
      ).toEqual({ deleted: true });
      expect(
        await count(
          "SELECT count(*) AS n FROM user WHERE id = ?",
          second.user.id
        )
      ).toBe(1);
    });
  });

  describe("with a session older than freshAge", () => {
    async function makeStale(authed: AuthedUser): Promise<AuthedUser> {
      await env.DB.prepare(
        "UPDATE session SET created_at = ? WHERE user_id = ?"
      )
        .bind(Date.now() - 2 * 24 * 60 * 60 * 1000, authed.user.id)
        .run();
      return authed;
    }

    async function staleUser(): Promise<AuthedUser> {
      return await makeStale(await signedUpUser());
    }

    it("refuses an account without a password: sign in again", async () => {
      const authed = await makeStale(await passwordlessUser());
      await expect(
        call(
          accountRouter.delete,
          { confirm: "DELETE" },
          await authedContext(authed)
        )
      ).rejects.toMatchObject({ code: "SESSION_NOT_FRESH", status: 403 });
      expect(
        await count(
          "SELECT count(*) AS n FROM user WHERE id = ?",
          authed.user.id
        )
      ).toBe(1);
    });

    it("refuses a wrong password", async () => {
      const authed = await staleUser();
      await expect(
        call(
          accountRouter.delete,
          { confirm: "DELETE", password: "wrong password" },
          await authedContext(authed)
        )
      ).rejects.toMatchObject({ code: "INVALID_PASSWORD", status: 400 });
      expect(
        await count(
          "SELECT count(*) AS n FROM user WHERE id = ?",
          authed.user.id
        )
      ).toBe(1);
    });

    it("deletes with the password", async () => {
      const authed = await staleUser();
      expect(
        await call(
          accountRouter.delete,
          { confirm: "DELETE", password: PASSWORD },
          await authedContext(authed)
        )
      ).toEqual({ deleted: true });
      expect(
        await count(
          "SELECT count(*) AS n FROM user WHERE id = ?",
          authed.user.id
        )
      ).toBe(0);
    });
  });
});
