// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@/payload-types";
import config from "../payload.config";

/**
 * The account endpoints, driven through `handleEndpoints` against a real
 * database.
 *
 * `handleEndpoints` rather than the handlers directly, for the reason
 * `auth.int.test.ts` and `favorites.int.test.ts` both give: half of what can
 * go wrong here is routing and authentication, and a handler called with a
 * hand-built `req` exercises neither. The session goes in as a `Cookie`
 * header and Payload's own strategies resolve it.
 */
describe("the account endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  /** Every message the queue handed to the adapter, in order. */
  const outbox: { subject: string; text: string; to: string }[] = [];
  let realSendEmail: typeof payload.sendEmail;

  const SITE = "http://localhost:3003";
  const PASSWORD = "account-int-password";
  const run = crypto.randomUUID().slice(0, 8);

  const unique = (prefix: string) =>
    `account-${prefix}-${crypto.randomUUID()}@example.test`;

  const signIn = async (email: string, password = PASSWORD) => {
    const { token } = await payload.login({
      collection: "users",
      data: { email, password },
    });

    if (token === undefined) {
      throw new Error("login issued no token");
    }

    return `payload-token=${token}`;
  };

  const createMember = async (prefix: string) => {
    const email = unique(prefix);
    const user = await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    return { cookie: await signIn(email), email, id: user.id };
  };

  const createList = async (owner: number | string, name: string) =>
    await payload.create({
      collection: "lists",
      data: { name, owner: Number(owner), visibility: "private" },
    });

  const post = (
    path: string,
    fields: Record<string, string>,
    init: { cookie?: string; origin?: string } = {}
  ) => {
    const body = new URLSearchParams(fields);
    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    if (init.cookie !== undefined) {
      headers.set("Cookie", init.cookie);
    }

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}/api${path}`, {
        body: body.toString(),
        headers,
        method: "POST",
      }),
    });
  };

  /**
   * Locks an account, and refuses to pretend it did if it did not.
   *
   * Copied in spirit from `auth.int.test.ts`: a fixture that quietly failed
   * to lock would leave the test below comparing one wrong-password answer
   * with another and calling it a `LockedAuth` test.
   */
  const lockOut = async (email: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await payload
        .login({
          collection: "users",
          data: { email, password: "wrong-wrong" },
        })
        .catch(() => null);
    }

    const { docs } = await payload.find({
      collection: "users",
      overrideAccess: true,
      showHiddenFields: true,
      where: { email: { equals: email } },
    });

    const lockUntil = docs[0]?.lockUntil as string | undefined;

    if (
      lockUntil === undefined ||
      new Date(lockUntil).getTime() <= Date.now()
    ) {
      throw new Error(`${email} did not lock after five failed sign-ins`);
    }
  };

  /** The account row as the database holds it, hidden fields included. */
  const reload = async (id: number | string) =>
    (await payload.findByID({
      collection: "users",
      depth: 0,
      id,
      overrideAccess: true,
      showHiddenFields: true,
    })) as User & {
      pendingEmail?: null | string;
      pendingEmailExpiresAt?: null | string;
      pendingEmailToken?: null | string;
    };

  const canSignIn = async (email: string, password: string) => {
    try {
      await payload.login({ collection: "users", data: { email, password } });

      return true;
    } catch {
      return false;
    }
  };

  /**
   * Clears a lockout so `canSignIn` reports on the *password* again.
   *
   * Without this, asserting `canSignIn(email, NEXT) === false` on a locked
   * account proves nothing: Payload raises `LockedAuth` before it ever
   * compares a hash, so the call answers `false` for the correct password
   * too. That assertion sat in the locked-account test below and passed in
   * both directions — it would not have noticed the endpoint changing the
   * password of an account it had just refused. Measured, not reasoned
   * about: a probe that locked an account, changed its password through
   * `payload.update`, and then signed in with the *new* password still got
   * `false`.
   *
   * `payload.unlock` is Payload's own operation for this
   * (`auth/operations/unlock.js`), so the fixture does not have to know
   * which columns a lockout is spelled in.
   */
  const unlock = async (email: string) => {
    await payload.unlock({
      collection: "users",
      /*
       * `password` is required by the *type* and read by nothing.
       * `AuthOperationsFromCollectionSlug<'users'>['unlock']` is generated
       * from the login shape, but `unlockOperation` builds its `where` from
       * `data.email` alone and never looks at a password
       * (`payload/dist/auth/operations/unlock.js`) — unlocking is an
       * administrative act, not an authentication. Passing the real one
       * would read as though it mattered.
       */
      data: { email, password: "" },
      // Required by the type, and correct for a fixture: `users.access.unlock`
      // is an administrator's gate and this is the suite, not a caller.
      overrideAccess: true,
    });
  };

  /**
   * Runs the queue once, exactly as `GET /api/jobs/run` does.
   *
   * `overrideAccess: true` because `jobs.access.run` is `denyAll`: the Local
   * API is the only door into the queue, which is the property
   * `src/jobs/index.ts` exists to create.
   */
  const drain = () =>
    payload.jobs.run({
      limit: 25,
      overrideAccess: true,
      queue: "default",
      sequential: true,
    });

  /**
   * Runs `write`, drains the queue, and returns the confirmation URL the
   * account holder was actually sent.
   *
   * **This helper is the Stage 4 deferral closing.** It used to read the link
   * out of a log line, because there was no adapter and the endpoint wrote the
   * URL to the console — and it carried a note saying it was what would have
   * to change when Stage 7 wired one up. This is that change: nothing is
   * logged any more, the link comes out of the outbox, and
   * `sends the email-change confirmation instead of logging it` asserts both
   * halves of that sentence.
   */
  const capturedConfirmLink = async (
    write: () => Promise<unknown>,
    recipient: string
  ) => {
    await write();
    await drain();

    /*
     * Keyed on the recipient, not on "the most recent message". Every other
     * test in this file that starts an address change leaves its job in the
     * queue, and one drain runs all of them — so the outbox after a drain
     * holds several confirmation links and the first one is somebody else's.
     * Asserting a link that belongs to another account is how this test would
     * pass while proving nothing, and it is exactly how it failed first.
     */
    const message = outbox.filter((sent) => sent.to === recipient).at(-1);

    return message?.text
      .split("\n")
      .find(
        (line) => line.startsWith("http://") || line.startsWith("https://")
      );
  };

  const sessionResolves = async (cookie: string) => {
    const { user } = await payload.auth({
      headers: new Headers({ Cookie: cookie }),
    });

    return user !== null;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    /*
     * The outbox. Replaced rather than spied, because `vi.restoreAllMocks()`
     * in a neighbouring file's `afterEach` would otherwise put the real
     * binding back under this one — `isolate: false` shares the instance.
     */
    realSendEmail = payload.sendEmail;
    payload.sendEmail = (async (message: {
      subject?: string;
      text?: unknown;
      to?: unknown;
    }) => {
      outbox.push({
        subject: message.subject ?? "",
        text: String(message.text ?? ""),
        to: String(message.to ?? ""),
      });

      return { accepted: true };
    }) as typeof payload.sendEmail;
  });

  afterAll(async () => {
    payload.sendEmail = realSendEmail;

    await payload.delete({
      collection: "lists",
      where: { name: { like: `Account int ${run}` } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { like: "account-" } },
    });
  });

  describe("changing the password", () => {
    const NEXT = "a-fresh-long-password";

    it("changes it when the current one is right", async () => {
      const member = await createMember("pw-happy");

      const response = await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?notice=password-changed"
      );
      expect(await canSignIn(member.email, NEXT)).toBe(true);
      expect(await canSignIn(member.email, PASSWORD)).toBe(false);
    });

    it("refuses a wrong current password, and leaves the old one working", async () => {
      /*
       * The guard the whole endpoint rests on. Without it a borrowed session
       * cookie is a password change, and a password change is the account.
       */
      const member = await createMember("pw-wrong-current");

      const response = await post(
        "/account/password",
        { current: "not-the-password", locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=credentials"
      );
      expect(await canSignIn(member.email, PASSWORD)).toBe(true);
      expect(await canSignIn(member.email, NEXT)).toBe(false);
    });

    it("answers a locked account exactly as it answers a wrong password", async () => {
      /*
       * Review Focus item 5's shape, applied to a signed-in surface. Payload
       * raises `LockedAuth` here, with a message only a real account can
       * provoke — and on this endpoint it would additionally tell whoever
       * holds a stolen cookie exactly when their guessing budget refills.
       * The two answers have to be the same bytes, and the account must not
       * change under either.
       */
      const member = await createMember("pw-locked");
      const wrong = await post(
        "/account/password",
        { current: "not-the-password", locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      await lockOut(member.email);

      const locked = await post(
        "/account/password",
        // The *correct* password, refused only because the account is locked.
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(locked.status).toBe(wrong.status);
      expect(locked.headers.get("Location")).toBe(
        wrong.headers.get("Location")
      );
      expect(await locked.text()).toBe(await wrong.text());

      /*
       * Unlocked first, deliberately. A locked account refuses every
       * password, so checking `NEXT` while the lock stands is a tautology —
       * see `unlock` above. Both directions are asserted because only the
       * pair distinguishes "the write was refused" from "the account is
       * simply unusable": the old password must still work, and the one the
       * refused request tried to set must not.
       */
      await unlock(member.email);
      expect(await canSignIn(member.email, NEXT)).toBe(false);
      expect(await canSignIn(member.email, PASSWORD)).toBe(true);
    });

    it("holds a refusal to the timing floor", async () => {
      /*
       * Asserted with slack below the 500 ms floor, the way
       * `auth.int.test.ts` does it: pinning the exact number makes the test
       * fail on a slow machine instead of on a regression.
       */
      const member = await createMember("pw-timing");
      const started = Date.now();

      await post(
        "/account/password",
        { current: "not-the-password", locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    });

    it("refuses a new password the policy rejects", async () => {
      const member = await createMember("pw-weak");

      const response = await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: "abc" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=password"
      );
      expect(await canSignIn(member.email, PASSWORD)).toBe(true);
      expect(await canSignIn(member.email, "abc")).toBe(false);
    });

    it("ends every session the account had", async () => {
      /*
       * A password is changed because it leaked or because somebody else has
       * been using it. Both mean the sessions opened with the old one have
       * to stop working — on the other device, not only in this tab.
       */
      const member = await createMember("pw-sessions");
      const elsewhere = await signIn(member.email);

      expect(await sessionResolves(elsewhere)).toBe(true);

      await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(await sessionResolves(elsewhere)).toBe(false);
      expect(await sessionResolves(member.cookie)).toBe(false);
    });

    it("expires the caller's own cookie", async () => {
      const member = await createMember("pw-cookie");

      const response = await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie }
      );

      expect(response.headers.getSetCookie().join(";")).toMatch(
        /payload-token=;/
      );
    });

    it("refuses a caller with no session", async () => {
      const response = await post("/account/password", {
        current: PASSWORD,
        locale: "nl",
        next: NEXT,
      });

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl/sign-in");
    });

    it("refuses a request posted from another site", async () => {
      const member = await createMember("pw-origin");

      const response = await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie, origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      expect(await canSignIn(member.email, PASSWORD)).toBe(true);
    });

    it("accepts one posted from this site", async () => {
      // The other half: a guard that refused everything would pass the test
      // above and break the form.
      const member = await createMember("pw-origin-ok");

      const response = await post(
        "/account/password",
        { current: PASSWORD, locale: "nl", next: NEXT },
        { cookie: member.cookie, origin: SITE }
      );

      expect(response.status).toBe(303);
      expect(await canSignIn(member.email, NEXT)).toBe(true);
    });

    it("honours the locale the form carried", async () => {
      const member = await createMember("pw-locale");

      const response = await post(
        "/account/password",
        { current: "not-the-password", locale: "fr", next: NEXT },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/fr/account?error=credentials"
      );
    });
  });

  describe("changing the email address", () => {
    const target = () => unique("pw-target");

    it("does not move the address until it is confirmed", async () => {
      /*
       * The property this whole flow exists for. An address that moves on
       * request is an account-takeover path: point the account at an address
       * you control, then reset the password to it.
       */
      const member = await createMember("email-pending");
      const wanted = target();

      const response = await post(
        "/account/email",
        { current: PASSWORD, email: wanted, locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?notice=email-pending"
      );

      const stored = await reload(member.id);

      expect(stored.email).toBe(member.email);
      expect(stored.pendingEmail).toBe(wanted);
      expect(await canSignIn(wanted, PASSWORD)).toBe(false);
      expect(await canSignIn(member.email, PASSWORD)).toBe(true);
    });

    it("stores the confirmation token hashed, never in the clear", async () => {
      const member = await createMember("email-hashed");

      await post(
        "/account/email",
        { current: PASSWORD, email: target(), locale: "nl" },
        { cookie: member.cookie }
      );
      /*
       * The digest is written by the send and not by the request. Stage 7
       * moved the minting into `jobs/sendEmail.ts`, because a job's input is
       * logged in full by Payload whenever a task throws and a deferred send
       * is an ordinary event — `lib/emailChange.ts` says so at length. Until
       * the queue runs there is a pending address and no credential, which is
       * a pending change nobody can confirm rather than one anybody can.
       */
      await drain();

      const stored = await reload(member.id);

      // 32 bytes as hex. A stored raw token would be the same length, so the
      // length alone proves nothing — the confirmation test below is what
      // proves the stored value is a *digest* of the token and not the token.
      expect(stored.pendingEmailToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it("sends the email-change confirmation instead of logging it", async () => {
      /*
       * Stage 4 Task 5's deferral, closed. The endpoint wrote the confirmation
       * link to the console because no adapter existed; **deleting that log
       * without sending anything is the failure this test exists to prevent**,
       * so it asserts both halves — a message went out carrying the link, and
       * nothing anywhere wrote the token to a log.
       */
      const member = await createMember("email-sent");
      const wanted = target();

      const logger = payload.logger as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const levels = ["debug", "error", "info", "warn"];
      const originals = levels.map((level) => logger[level]);
      const lines: string[] = [];

      for (const [index, level] of levels.entries()) {
        logger[level] = (...args: unknown[]) => {
          lines.push(args.map((arg) => JSON.stringify(arg) ?? "").join(" "));

          return originals[index]?.apply(logger, args);
        };
      }

      let link: string | undefined;

      try {
        link = await capturedConfirmLink(
          () =>
            post(
              "/account/email",
              { current: PASSWORD, email: wanted, locale: "nl" },
              { cookie: member.cookie }
            ),
          wanted
        );
      } finally {
        for (const [index, level] of levels.entries()) {
          logger[level] = originals[index] as (...args: unknown[]) => unknown;
        }
      }

      expect(link).toBeDefined();

      const token = new URL(link ?? "").searchParams.get("token") ?? "";

      expect(token).not.toBe("");
      // It went to the address being claimed, not to the one on the account:
      // the whole point is proving somebody reads the *new* mailbox. Exactly
      // one message, so a second attempt would show up here rather than being
      // hidden behind `find`.
      const sent = outbox.filter((message) => message.to === wanted);

      expect(sent).toHaveLength(1);
      expect(sent[0]?.subject).toBe("Bevestig je nieuwe e-mailadres");
      expect(sent[0]?.to).not.toBe(member.email);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.filter((line) => line.includes(token))).toEqual([]);
    });

    it("ends an earlier change's link when a new one is started", async () => {
      /*
       * One pending change, one live link. The token is minted by the send
       * now, so the request that *starts* a change has to clear the previous
       * one explicitly — and if it did not, the link already sitting in the
       * first address's mailbox would confirm the second address, which is a
       * mailbox the account holder may no longer control.
       */
      const member = await createMember("email-relink");
      const first = target();
      const second = target();

      const firstLink = await capturedConfirmLink(
        () =>
          post(
            "/account/email",
            { current: PASSWORD, email: first, locale: "nl" },
            { cookie: member.cookie }
          ),
        first
      );
      const firstToken =
        new URL(firstLink ?? "").searchParams.get("token") ?? "";

      expect(firstToken).not.toBe("");

      await post(
        "/account/email",
        { current: PASSWORD, email: second, locale: "nl" },
        { cookie: member.cookie }
      );

      const spent = await post("/account/confirm-email", {
        locale: "nl",
        token: firstToken,
      });

      expect(spent.headers.get("Location")).toBe(
        "/nl/account/confirm-email?error=link"
      );
      expect((await reload(member.id)).email).toBe(member.email);

      // The positive beside the negative: the *new* change still works, so
      // this is one link being ended rather than the flow being broken.
      await drain();

      const secondLink = outbox
        .filter((message) => message.to === second)
        .at(-1)
        ?.text.split("\n")
        .find((line) => line.startsWith("http"));
      const secondToken =
        new URL(secondLink ?? "").searchParams.get("token") ?? "";

      const confirmed = await post("/account/confirm-email", {
        locale: "nl",
        token: secondToken,
      });

      expect(confirmed.headers.get("Location")).toBe(
        "/nl/sign-in?notice=email-changed"
      );
      expect((await reload(member.id)).email).toBe(second);
    });

    it("refuses without the current password", async () => {
      const member = await createMember("email-nopw");

      const response = await post(
        "/account/email",
        { current: "not-the-password", email: target(), locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=credentials"
      );
      expect((await reload(member.id)).pendingEmail ?? null).toBeNull();
    });

    it("refuses an address that is not an address", async () => {
      const member = await createMember("email-shape");

      for (const email of ["", "not-an-email", "a@b", "a b@example.test"]) {
        const response = await post(
          "/account/email",
          { current: PASSWORD, email, locale: "nl" },
          { cookie: member.cookie }
        );

        expect(response.headers.get("Location"), email).toBe(
          "/nl/account?error=email"
        );
      }

      expect((await reload(member.id)).pendingEmail ?? null).toBeNull();
    });

    it("refuses the address the account already has", async () => {
      const member = await createMember("email-same");

      const response = await post(
        "/account/email",
        {
          current: PASSWORD,
          // Upper-cased, because the comparison has to normalise both sides
          // or the account parks a change to the address it already holds.
          email: member.email.toUpperCase(),
          locale: "nl",
        },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=email-unchanged"
      );
    });

    it("says nothing about whether the new address is already registered", async () => {
      /*
       * Review Focus item 5, on the one surface where it is easiest to
       * forget: a "that address is taken" answer here is a one-request
       * enumeration oracle for any address an attacker cares to name, from
       * inside a throwaway account they registered themselves.
       */
      const member = await createMember("email-oracle");
      const neighbour = await createMember("email-neighbour");

      const taken = await post(
        "/account/email",
        { current: PASSWORD, email: neighbour.email, locale: "nl" },
        { cookie: member.cookie }
      );
      const free = await post(
        "/account/email",
        { current: PASSWORD, email: target(), locale: "nl" },
        { cookie: member.cookie }
      );

      expect(taken.status).toBe(free.status);
      expect(taken.headers.get("Location")).toBe(free.headers.get("Location"));
      expect(await taken.text()).toBe(await free.text());
    });

    it("refuses a caller with no session", async () => {
      const response = await post("/account/email", {
        current: PASSWORD,
        email: target(),
        locale: "nl",
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in");
    });

    it("refuses a request posted from another site", async () => {
      const member = await createMember("email-origin");

      const response = await post(
        "/account/email",
        { current: PASSWORD, email: target(), locale: "nl" },
        { cookie: member.cookie, origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      expect((await reload(member.id)).pendingEmail ?? null).toBeNull();
    });

    it("holds every refusal to the timing floor, not only the slow one", async () => {
      /*
       * **Each branch, not one of them.** The first version of this test
       * refused one way — a wrong password — and a mutation that deleted the
       * `pad` from the malformed-address branch survived the whole suite:
       * the endpoint's own slow path was still padded, so the assertion
       * stayed green while two of the three refusals had become instant.
       * The property is "one answer, one timing class"; a test that samples
       * one branch cannot say that. Transcript M15 in the Task 5 report.
       */
      const member = await createMember("email-timing");

      const refusals: Record<string, string> = {
        credentials: "not-the-password",
        "email-unchanged": PASSWORD,
        email: PASSWORD,
      };

      for (const [error, current] of Object.entries(refusals)) {
        const email =
          error === "email"
            ? "not-an-email"
            : error === "email-unchanged"
              ? member.email
              : target();
        const started = Date.now();
        const response = await post(
          "/account/email",
          { current, email, locale: "nl" },
          { cookie: member.cookie }
        );

        // The branch really is the one being timed, not a different refusal
        // that happens to be padded.
        expect(response.headers.get("Location"), error).toBe(
          `/nl/account?error=${error}`
        );
        expect(Date.now() - started, error).toBeGreaterThanOrEqual(450);
      }
    });
  });

  describe("confirming an email change", () => {
    /**
     * Writes a pending change with a token this test chose.
     *
     * The real endpoint's token is never stored — only its digest is — so it
     * cannot be read back out of the row, which is the whole point. For the
     * cases below that need a token with a *particular* property (expired,
     * already used, pointing at a taken address) the record is planted
     * directly through the same field the endpoint writes.
     *
     * **`plant` proves nothing about the endpoint's own hashing**, and that
     * is why `the link it issues is the link that confirms` exists: it takes
     * the URL the endpoint logged and presents it, so a request handler that
     * stored the token in the clear, hashed it twice, or built the link with
     * the digest in it fails there rather than in a mailbox.
     */
    const plant = async (id: number | string, email: string, ttlMs: number) => {
      const token = crypto.randomUUID().replaceAll("-", "");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token)
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");

      await payload.update({
        collection: "users",
        data: {
          pendingEmail: email,
          pendingEmailExpiresAt: new Date(Date.now() + ttlMs).toISOString(),
          pendingEmailToken: hash,
        },
        id,
        overrideAccess: true,
      });

      return token;
    };

    it("the link it issues is the link that confirms", async () => {
      /*
       * The round trip, through the endpoint's own token rather than a
       * planted one. Every other test in this block starts from a record
       * this file wrote; this is the only one that would fail if the request
       * handler and the confirm handler disagreed about what is stored —
       * which is exactly the disagreement that would ship, because each half
       * passes its own tests.
       */
      const member = await createMember("email-roundtrip");
      const wanted = unique("email-roundtrip-new");

      const link = await capturedConfirmLink(
        () =>
          post(
            "/account/email",
            { current: PASSWORD, email: wanted, locale: "nl" },
            { cookie: member.cookie }
          ),
        wanted
      );

      expect(link).toBeDefined();

      const token = new URL(link ?? "").searchParams.get("token") ?? "";

      expect(token).not.toBe("");
      // The link carries the token; the row carries its digest. If these
      // were equal, a database read would be a set of usable links.
      expect((await reload(member.id)).pendingEmailToken).not.toBe(token);

      const response = await post("/account/confirm-email", {
        locale: "nl",
        token,
      });

      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?notice=email-changed"
      );
      expect((await reload(member.id)).email).toBe(wanted);
    });

    it("moves the address when the link is presented", async () => {
      const member = await createMember("confirm-happy");
      const wanted = unique("confirm-new");
      const token = await plant(member.id, wanted, 60_000);

      const response = await post("/account/confirm-email", {
        locale: "nl",
        token,
      });

      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?notice=email-changed"
      );

      const stored = await reload(member.id);

      expect(stored.email).toBe(wanted);
      expect(stored.pendingEmail ?? null).toBeNull();
      expect(stored.pendingEmailToken ?? null).toBeNull();
      expect(await canSignIn(wanted, PASSWORD)).toBe(true);
      expect(await canSignIn(member.email, PASSWORD)).toBe(false);
    });

    it("stores the token's digest and not the token", async () => {
      /*
       * The pair that makes the hashing provable rather than cosmetic: the
       * token confirms, and the value sitting in the column does not. An
       * endpoint that stored the raw token would pass the first half of this
       * and fail the second.
       */
      const member = await createMember("confirm-digest");
      const wanted = unique("confirm-digest-new");
      const token = await plant(member.id, wanted, 60_000);
      const stored = await reload(member.id);

      expect(stored.pendingEmailToken).not.toBe(token);

      const forged = await post("/account/confirm-email", {
        locale: "nl",
        token: stored.pendingEmailToken ?? "",
      });

      expect(forged.headers.get("Location")).toBe(
        "/nl/account/confirm-email?error=link"
      );
      expect((await reload(member.id)).email).toBe(member.email);
    });

    it("refuses a token that has expired", async () => {
      const member = await createMember("confirm-expired");
      const wanted = unique("confirm-expired-new");
      const token = await plant(member.id, wanted, -1000);

      const response = await post("/account/confirm-email", {
        locale: "nl",
        token,
      });

      expect(response.headers.get("Location")).toBe(
        "/nl/account/confirm-email?error=link"
      );
      expect((await reload(member.id)).email).toBe(member.email);
    });

    it("refuses an unknown token, and an absent one", async () => {
      const member = await createMember("confirm-unknown");

      await plant(member.id, unique("confirm-unknown-new"), 60_000);

      for (const token of ["", "f".repeat(64), "not-a-token"]) {
        const response = await post("/account/confirm-email", {
          locale: "nl",
          token,
        });

        expect(response.headers.get("Location"), token).toBe(
          "/nl/account/confirm-email?error=link"
        );
      }

      expect((await reload(member.id)).email).toBe(member.email);
    });

    it("cannot be replayed", async () => {
      const member = await createMember("confirm-replay");
      const wanted = unique("confirm-replay-new");
      const token = await plant(member.id, wanted, 60_000);

      await post("/account/confirm-email", { locale: "nl", token });

      const again = await post("/account/confirm-email", {
        locale: "nl",
        token,
      });

      expect(again.headers.get("Location")).toBe(
        "/nl/account/confirm-email?error=link"
      );
      expect((await reload(member.id)).email).toBe(wanted);
    });

    it("refuses an address that has been taken since the link was sent", async () => {
      /*
       * The race the request endpoint deliberately does not close, because
       * closing it there would be an enumeration oracle. It has to be closed
       * here, where the visitor has already proved they read the mailbox.
       */
      const member = await createMember("confirm-taken");
      const neighbour = await createMember("confirm-neighbour");
      const token = await plant(member.id, neighbour.email, 60_000);

      const response = await post("/account/confirm-email", {
        locale: "nl",
        token,
      });

      expect(response.headers.get("Location")).toBe(
        "/nl/account/confirm-email?error=link"
      );
      expect((await reload(member.id)).email).toBe(member.email);
      expect((await reload(neighbour.id)).email).toBe(neighbour.email);
    });

    it("does not touch an account whose token was not presented", async () => {
      const member = await createMember("confirm-isolated");
      const bystander = await createMember("confirm-bystander");

      await plant(bystander.id, unique("confirm-bystander-new"), 60_000);

      const token = await plant(member.id, unique("confirm-mine"), 60_000);

      await post("/account/confirm-email", { locale: "nl", token });

      const other = await reload(bystander.id);

      expect(other.email).toBe(bystander.email);
      expect(other.pendingEmail).not.toBeNull();
    });

    it("refuses a request posted from another site", async () => {
      const member = await createMember("confirm-origin");
      const wanted = unique("confirm-origin-new");
      const token = await plant(member.id, wanted, 60_000);

      const response = await post(
        "/account/confirm-email",
        { locale: "nl", token },
        { origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      expect((await reload(member.id)).email).toBe(member.email);
    });
  });

  describe("deleting an account, refused", () => {
    it("refuses when the typed address is not the account's", async () => {
      const member = await createMember("delete-mistyped");

      const response = await post(
        "/account/delete",
        { confirmEmail: `x${member.email}`, locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=confirm"
      );
      await expect(
        payload.findByID({
          collection: "users",
          disableErrors: true,
          id: member.id,
        })
      ).resolves.not.toBeNull();
    });

    it("refuses when no address is typed at all", async () => {
      const member = await createMember("delete-empty");

      const response = await post(
        "/account/delete",
        { locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account?error=confirm"
      );
      await expect(
        payload.findByID({
          collection: "users",
          disableErrors: true,
          id: member.id,
        })
      ).resolves.not.toBeNull();
    });

    it("accepts the address in a different case", async () => {
      // The other half of the comparison: a check that compared the raw
      // strings would refuse a perfectly correct confirmation typed by a
      // phone keyboard.
      const member = await createMember("delete-case");

      const response = await post(
        "/account/delete",
        { confirmEmail: member.email.toUpperCase(), locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?notice=deleted"
      );
    });

    it("refuses a caller with no session", async () => {
      const member = await createMember("delete-signedout");

      const response = await post("/account/delete", {
        confirmEmail: member.email,
        locale: "nl",
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in");
      await expect(
        payload.findByID({
          collection: "users",
          disableErrors: true,
          id: member.id,
        })
      ).resolves.not.toBeNull();
    });

    it("refuses a request posted from another site", async () => {
      const member = await createMember("delete-origin");

      const response = await post(
        "/account/delete",
        { confirmEmail: member.email, locale: "nl" },
        { cookie: member.cookie, origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      await expect(
        payload.findByID({
          collection: "users",
          disableErrors: true,
          id: member.id,
        })
      ).resolves.not.toBeNull();
    });

    it("expires the caller's cookie when it does delete", async () => {
      const member = await createMember("delete-cookie");

      const response = await post(
        "/account/delete",
        { confirmEmail: member.email, locale: "nl" },
        { cookie: member.cookie }
      );

      expect(response.headers.getSetCookie().join(";")).toMatch(
        /payload-token=;/
      );
    });
  });

  describe("deleting an account", () => {
    let victim: Awaited<ReturnType<typeof createMember>>;
    let bystander: Awaited<ReturnType<typeof createMember>>;
    let victimList: number | string;
    let bystanderList: number | string;
    let consentId: number | string;
    let deleteResponse: Response;
    let consentUserBefore: unknown;

    beforeAll(async () => {
      victim = await createMember("delete-victim");
      bystander = await createMember("delete-bystander");

      victimList = (await createList(victim.id, `Account int ${run} victim`))
        .id;
      bystanderList = (
        await createList(bystander.id, `Account int ${run} bystander`)
      ).id;

      const consent = await payload.create({
        collection: "user-consents",
        data: {
          analyticsConsent: true,
          consentVersion: `account-int-${run}`,
          user: Number(victim.id),
        },
      });

      consentId = consent.id;
      /*
       * Read back rather than trusted. "The consent survives with a null
       * user" is only a statement about the deletion if the row *started*
       * with the user on it — a fixture that quietly failed to set it would
       * make the assertion below pass against no behaviour at all.
       */
      consentUserBefore = (
        await payload.findByID({
          collection: "user-consents",
          depth: 0,
          id: consent.id,
        })
      ).user;

      /*
       * The delete runs here so all four tests below observe one deletion
       * rather than four, but **nothing is asserted in this hook**. A `beforeAll`
       * that throws marks every test in the block *skipped*, which a CI summary
       * reads as "nothing to see here" — the hazard `apps/site/README.md`
       * documents and the one a mutation sweep must never be fooled by. The
       * status is asserted in a named test instead.
       */
      deleteResponse = await post(
        "/account/delete",
        { confirmEmail: victim.email, locale: "nl" },
        { cookie: victim.cookie }
      );
    });

    it("answers the redirect every one of these endpoints answers with", () => {
      expect(deleteResponse.status).toBe(303);
      expect(deleteResponse.headers.get("Location")).toBe(
        "/nl/sign-in?notice=deleted"
      );
    });

    it("deletes the account and its lists", async () => {
      await expect(
        payload.findByID({
          collection: "users",
          disableErrors: true,
          id: victim.id,
        })
      ).resolves.toBeNull();

      await expect(
        payload.findByID({
          collection: "lists",
          disableErrors: true,
          id: victimList,
        })
      ).resolves.toBeNull();
    });

    it("keeps the consent record, with a null user", async () => {
      /*
       * A legal-retention requirement from the spec, not a nicety.
       * `user_consents.user` was deliberately left optional — see
       * `collections/UserConsents.ts` — so the column is nullable and the
       * record survives the account it describes, anonymised rather than
       * destroyed. A cascade that took the consents with it would destroy
       * evidence, and no happy-path test would notice.
       */
      expect(consentUserBefore).toBe(victim.id);

      const consent = await payload.findByID({
        collection: "user-consents",
        depth: 0,
        disableErrors: true,
        id: consentId,
      });

      expect(consent).not.toBeNull();
      expect(consent?.user ?? null).toBeNull();
      expect(consent?.consentVersion).toBe(`account-int-${run}`);
    });

    it("does not delete another user's lists", async () => {
      const list = await payload.findByID({
        collection: "lists",
        depth: 0,
        disableErrors: true,
        id: bystanderList,
      });

      expect(list).not.toBeNull();

      const account = await payload.findByID({
        collection: "users",
        disableErrors: true,
        id: bystander.id,
      });

      expect(account).not.toBeNull();
    });
  });
});
