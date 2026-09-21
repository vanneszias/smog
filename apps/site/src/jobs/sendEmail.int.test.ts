// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findSponsorshipByReEditToken } from "@/lib/reEdit";
import type { Sponsorship, TaskSendEmail } from "@/payload-types";
import config from "../payload.config";
import type { SendEmailInput } from "./sendEmail";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, and
 * `sponsorships.reEditToken` refuses duplicates. A collision throws inside
 * `beforeAll`, which Vitest reports as *skipped* rather than failed — a file
 * that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";

/*
 * A stand-in for the run endpoint's shared secret, never a real credential.
 * `isolate: false` means this process is shared with every file that runs
 * after this one, so it is set and unset rather than assigned — assigning
 * `undefined` leaves the string "undefined" behind, which is a usable
 * password. `endpoints/jobs.int.test.ts` carries the same note.
 */
const TOKEN_VAR = "JOBS_RUN_TOKEN";
const STUB_TOKEN = "send-email-int-token-for-tests-only";
const ORIGINAL_TOKEN = process.env[TOKEN_VAR];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PRICE = 5000;

/** The number of executions `retries.attempts: 3` actually permits. */
const BOUNDED_ATTEMPTS = 4;

/** A refusal shaped the way Cloudflare's Email Service shapes one. */
function refusal(code: string): Error {
  return Object.assign(new Error(`refused: ${code}`), { code });
}

interface SentMessage {
  subject: string;
  text: string;
  to: string;
}

/**
 * The `send-email` task, driven through Payload's own queue against a real
 * database, with the binding replaced by an outbox.
 *
 * **What is real here and what is not.** The queue is real: the rows, the
 * retry counting, the backoff and the cancellation are Payload's, and the
 * distinction between "deferred" and "given up on" is read off the job row
 * rather than off a counter this file keeps. `payload.sendEmail` is replaced,
 * so **nothing below is evidence about Cloudflare** — the adapter's own tests
 * cover the translation, and Task 7 is first contact. What these prove is the
 * shape of the protocol and the decisions this application makes about it,
 * which is the same standing as every other provider in this project.
 *
 * The queue is shared state. `.wrangler/state/vitest` is persisted, so jobs
 * queued by earlier runs and by other files (every test anywhere that moves a
 * sponsorship into `pending_resubmission` queues one) are sitting in it. A
 * test that asserts on "the queue" has to own it, so `beforeAll` empties it.
 */
describe("the send-email task", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  /** Every message the task handed to the adapter, in order. */
  let outbox: SentMessage[] = [];
  /** Every line any of this file's code put in the log, flattened to strings. */
  let logLines: string[] = [];
  /** What the next send does. Replaced per test. */
  let nextSend: () => Promise<void> = () => Promise.resolve();

  let realSendEmail: typeof payload.sendEmail;
  const realLog: Record<string, unknown> = {};

  const seedGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Mail ${label} ${RUN}`,
        playbackId: `pb-mail-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  const seedSponsorship = async (label: string): Promise<number> => {
    const gesture = await seedGesture(label);
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + 365 * DAY).toISOString(),
        gesture,
        originalVideoPlaybackId: `pb-mail-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `sponsor-${label}-${RUN}@example.test`,
        sponsorName: `Acme ${label}`,
        startDate: new Date().toISOString(),
        // Not `pending_resubmission`: a create is not a transition, and the
        // point of every fixture here is the *move* into it.
        status: "pending_approval",
      },
    });

    return row.id;
  };

  const setStatus = (id: number, status: Sponsorship["status"]) =>
    payload.update({
      collection: "sponsorships",
      data: { status },
      id,
      overrideAccess: true,
    });

  /** The row as the database holds it, hidden fields included. */
  const reload = (id: number) =>
    payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
      overrideAccess: true,
      showHiddenFields: true,
    }) as Promise<Sponsorship>;

  /** Every job still in the queue, newest first. */
  const queued = async () => {
    const { docs } = await payload.find({
      collection: "payload-jobs",
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: "-createdAt",
    });

    return docs;
  };

  /**
   * Runs the queue once, exactly as `GET /api/jobs/run` does.
   *
   * `overrideAccess: true` because `jobs.access.run` is `denyAll` — the Local
   * API is the only door, which is the property `src/jobs/index.ts` exists to
   * create.
   */
  const runQueue = () =>
    payload.jobs.run({
      limit: 25,
      overrideAccess: true,
      queue: "default",
      sequential: true,
    });

  /**
   * Clears a deferred job's `waitUntil` so the next run picks it up.
   *
   * The backoff is real — `retries a quota refusal` asserts that a deferred
   * job carries a future `waitUntil`, which is the whole of "defers rather
   * than drops". It is simply not what the *attempt count* tests are about,
   * and waiting 5s, 10s and 20s to prove a bound would make this file slower
   * than the rest of the suite put together.
   */
  const clearBackoff = async () => {
    for (const job of await queued()) {
      await payload.update({
        collection: "payload-jobs",
        data: { waitUntil: null },
        id: job.id,
        overrideAccess: true,
      });
    }
  };

  const emptyQueue = () =>
    payload.delete({
      collection: "payload-jobs",
      overrideAccess: true,
      where: { id: { exists: true } },
    });

  beforeAll(async () => {
    process.env[TOKEN_VAR] = STUB_TOKEN;
    payload = await getPayload({ config });

    // The outbox. Replaced rather than spied, because `vi.restoreAllMocks()`
    // in a neighbouring file's `afterEach` would otherwise put the real
    // binding back under this one — `isolate: false` shares the instance.
    realSendEmail = payload.sendEmail;
    payload.sendEmail = (async (message: {
      subject?: string;
      text?: unknown;
      to?: unknown;
    }) => {
      await nextSend();
      outbox.push({
        subject: message.subject ?? "",
        text: String(message.text ?? ""),
        to: String(message.to ?? ""),
      });

      return { accepted: true };
    }) as typeof payload.sendEmail;

    // Every log line, at every level. `does not put the re-edit token in a log
    // line` is an assertion about all of them, including the ones Payload
    // writes itself — which is where the danger actually is, since
    // `handleTaskError` logs the whole job.
    const logger = payload.logger as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;

    for (const level of ["debug", "error", "info", "warn"]) {
      realLog[level] = logger[level];
      logger[level] = (...args: unknown[]) => {
        logLines.push(args.map((arg) => safeString(arg)).join(" "));

        return (realLog[level] as (...a: unknown[]) => unknown).apply(
          logger,
          args
        );
      };
    }

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Mail ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(async () => {
    outbox = [];
    logLines = [];
    nextSend = () => Promise.resolve();
    await emptyQueue();
  });

  afterAll(async () => {
    payload.sendEmail = realSendEmail;

    if (ORIGINAL_TOKEN === undefined) {
      delete process.env[TOKEN_VAR];
    } else {
      process.env[TOKEN_VAR] = ORIGINAL_TOKEN;
    }

    const logger = payload.logger as unknown as Record<string, unknown>;

    for (const [level, fn] of Object.entries(realLog)) {
      logger[level] = fn;
    }

    await emptyQueue();
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);
    expect(await queued()).toEqual([]);

    // And the handler's own input type still matches the schema Payload
    // generated from `inputSchema`. This assignment is the assertion; the
    // expectation below only keeps the value alive. A field added to one and
    // not the other stops `check-types`, which is the only place that drift
    // can be caught — the handler receives `input` as `any`.
    const sample: SendEmailInput = {
      kind: "re-edit",
      locale: "nl",
      origin: "https://example.test",
      sponsorshipId: 1,
    };
    const generated: TaskSendEmail["input"] = sample;

    expect(generated.kind).toBe("re-edit");
  });

  it("sends the re-edit link to the sponsor", async () => {
    /*
     * Stage 5 minted this token, stored it `hidden: true` and left it there:
     * nothing in the application could read it back out, so no sponsor has
     * ever been able to be sent one. This is that delivery, end to end — an
     * administrator moves the status, and what comes out of the queue is a
     * link that resolves to the sponsorship it was minted for.
     */
    const id = await seedSponsorship("invite");

    await setStatus(id, "pending_resubmission");
    await runQueue();

    const token = (await reload(id)).reEditToken ?? "";
    const message = outbox.find((sent) =>
      sent.to.startsWith(`sponsor-invite-${RUN}`)
    );

    expect(token).not.toBe("");
    expect(message).toBeDefined();
    expect(message?.subject).toBe("Pas je SMOG-sponsoring aan");
    expect(message?.text).toContain("Acme invite");
    expect(message?.text).toContain(`/nl/sponsor/re-edit?token=${token}`);

    // The positive that makes the assertion above mean something: the link in
    // the message is a link that works. A token the mail carried but the
    // access rule refuses is a sponsor staring at "this link is no longer
    // valid", and no string comparison would have noticed.
    const resolved = await findSponsorshipByReEditToken(payload, token);

    expect(resolved?.id).toBe(id);
  });

  it("does not put the re-edit token in a log line", async () => {
    /*
     * The token is a bearer credential with seven days on it. `email/adapter.ts`
     * logs nothing for this reason, and the queue is the other half of the
     * same problem: **Payload logs the whole job, `input` included, every time
     * a task throws** (`queues/errors/handleTaskError.js`). So the run below
     * is deliberately a *failing* one — the path where a token in the input
     * would be written out — and the assertion covers every log line at every
     * level, this application's and Payload's alike.
     */
    const id = await seedSponsorship("quiet");

    await setStatus(id, "pending_resubmission");

    const token = (await reload(id)).reEditToken ?? "";

    expect(token).not.toBe("");

    nextSend = () => Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    await runQueue();

    nextSend = () => Promise.resolve();
    await clearBackoff();
    await runQueue();

    // The positive beside the negative: the token did reach the sponsor.
    expect(outbox.at(-1)?.text).toContain(token);
    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.filter((line) => line.includes(token))).toEqual([]);
  });

  it("retries a quota refusal", async () => {
    /*
     * Review Focus 4, the half that must wait. A quota refusal says nothing
     * about the recipient, so the job is deferred with a backoff and tried
     * again — and the assertion is on the job row rather than on a retry
     * happening, because "still runnable, later" is the state that makes the
     * retry inevitable.
     */
    const id = await seedSponsorship("quota");

    nextSend = () => Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    await setStatus(id, "pending_resubmission");
    await runQueue();

    const [job] = await queued();

    expect(outbox).toEqual([]);
    expect(job).toBeDefined();
    expect(job?.hasError ?? false).toBe(false);
    expect(job?.totalTried).toBe(1);
    expect(Date.parse(String(job?.waitUntil))).toBeGreaterThan(Date.now());

    // And the retry really does send, rather than merely being permitted to.
    nextSend = () => Promise.resolve();
    await clearBackoff();
    await runQueue();

    expect(outbox).toHaveLength(1);
    expect(await queued()).toEqual([]);
  });

  it("does not retry a rejected recipient", async () => {
    /*
     * The other half. A suppressed recipient will be suppressed on the next
     * attempt too, so the job is cancelled rather than deferred: `hasError` is
     * set, `error.cancelled` says it was deliberate, and no further run picks
     * it up. A bad address retried for ever is a queue that never drains.
     */
    const id = await seedSponsorship("bounced");

    nextSend = () => Promise.reject(refusal("E_RECIPIENT_SUPPRESSED"));
    await setStatus(id, "pending_resubmission");
    await runQueue();

    const [job] = await queued();

    expect(job?.hasError).toBe(true);
    expect((job?.error as { cancelled?: boolean })?.cancelled).toBe(true);
    expect(String((job?.error as { message?: string })?.message)).toContain(
      "E_RECIPIENT_SUPPRESSED"
    );

    // A second tick must not touch it, and the *mechanism* is `hasError`
    // rather than the backoff: a cancelled job's `waitUntil` is cleared, so
    // nothing but the error flag is keeping it out of the query.
    expect(job?.waitUntil ?? null).toBeNull();

    nextSend = () => Promise.resolve();
    await runQueue();

    expect(outbox).toEqual([]);
  });

  it("gives up after a bounded number of attempts, and records why", async () => {
    /*
     * A refusal that never stops being transient still has to stop. Payload
     * counts `retries.attempts` as retries rather than as total tries, so the
     * bound is four executions — asserted as a literal, because deriving it
     * from the constant the policy sets would make raising that constant
     * invisible here.
     */
    const id = await seedSponsorship("hopeless");

    nextSend = () => Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    await setStatus(id, "pending_resubmission");

    let calls = 0;
    const counting = () => {
      calls += 1;

      return Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    };

    nextSend = counting;

    for (let tick = 0; tick < BOUNDED_ATTEMPTS + 2; tick += 1) {
      await clearBackoff();
      await runQueue();
    }

    const [job] = await queued();

    expect(calls).toBe(BOUNDED_ATTEMPTS);
    expect(job?.hasError).toBe(true);
    // The reason is on the row and not only in a console: an operator reading
    // the failed jobs has to be able to see *which* refusal it was, because
    // `E_SENDER_NOT_VERIFIED` is a DNS record somebody has to go and create.
    expect(JSON.stringify(job?.error)).toContain("E_DAILY_LIMIT_EXCEEDED");
  });

  it("sends both of one account's messages in a single tick", async () => {
    /*
     * **Two jobs in one tick must not run concurrently**, and this is the
     * endpoint asserting it rather than the Local API: `sequential: true`
     * lives in `endpoints/jobs.ts`, and it is there because Payload otherwise
     * runs a tick's jobs through `Promise.all`. This database has no
     * transactions — the premise every guard in this application rests on —
     * and updating a document rewrites its array tables, so two jobs touching
     * one account overlap inside SQLite. It is not theoretical: the first run
     * of this file died on `Failed query: insert into "users_sessions" …`
     * raised from inside that `Promise.all`.
     *
     * The account has several sessions on purpose. That is the array table the
     * overlapping rewrites collided in, and an account with one session is a
     * fixture only the guard under test can no longer refuse.
     */
    const email = `jobs-tick-${RUN}@example.test`;
    const password = "send-email-int-password";
    const pending = `jobs-tick-new-${RUN}@example.test`;
    const account = await payload.create({
      collection: "users",
      data: { email, password, role: "user" },
    });

    for (let session = 0; session < 3; session += 1) {
      await payload.login({ collection: "users", data: { email, password } });
    }

    await payload.update({
      collection: "users",
      data: {
        pendingEmail: pending,
        pendingEmailExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      },
      id: account.id,
      overrideAccess: true,
    });

    for (let message = 0; message < 2; message += 1) {
      await payload.jobs.queue({
        input: {
          kind: "email-change",
          locale: "nl",
          origin: SITE,
          userId: account.id,
        },
        task: "send-email",
      });
    }

    const response = await handleEndpoints({
      config,
      request: new Request(`${SITE}/api/jobs/run`, {
        headers: { authorization: `Bearer ${STUB_TOKEN}` },
        method: "GET",
      }),
    });

    expect(response.status).toBe(200);
    expect(outbox.filter((sent) => sent.to === pending)).toHaveLength(2);
    // Both finished, so neither was left deferred by a collision — a job that
    // threw would still be in the queue with `total_tried` at 1.
    expect(await queued()).toEqual([]);

    await payload.delete({
      collection: "users",
      id: account.id,
      overrideAccess: true,
    });
  });

  it("sends nothing for an invitation that has been withdrawn", async () => {
    /*
     * The token is destroyed the moment the sponsorship leaves
     * `pending_resubmission` (`hooks/manageReEditToken.ts`), so a mail queued
     * a minute before an administrator changed their mind would carry a dead
     * link — and the re-edit page cannot tell a spent token from an invented
     * one, by design. The sponsor would be asked to do something and handed a
     * broken door.
     */
    const id = await seedSponsorship("withdrawn");

    await setStatus(id, "pending_resubmission");
    await setStatus(id, "pending_approval");

    expect((await reload(id)).reEditToken ?? null).toBeNull();

    await runQueue();

    expect(outbox).toEqual([]);
    // And it is *finished*, not deferred: nothing about it will ever change,
    // so a retry would only fail four times and file a failure nobody can act
    // on.
    expect(await queued()).toEqual([]);
  });

  it("sends nothing for a sponsorship that has been deleted", async () => {
    const id = await seedSponsorship("deleted");

    await setStatus(id, "pending_resubmission");
    await payload.delete({
      collection: "sponsorships",
      id,
      overrideAccess: true,
    });

    await runQueue();

    expect(outbox).toEqual([]);
    expect(await queued()).toEqual([]);
  });

  it("sends nothing for an address change that was already confirmed", async () => {
    /*
     * The account holder can confirm — or an administrator can clear the
     * pending change — between the queueing and the tick that sends. Minting
     * a token for a change that is no longer pending would attach a live
     * credential to an account nobody asked about, and mail it to whatever
     * `pendingEmail` used to be.
     */
    const email = `confirmed-${RUN}@example.test`;
    const account = await payload.create({
      collection: "users",
      data: { email, password: "send-email-int-password", role: "user" },
    });

    await payload.jobs.queue({
      input: {
        kind: "email-change",
        locale: "nl",
        origin: SITE,
        userId: account.id,
      },
      task: "send-email",
    });
    await runQueue();

    expect(outbox).toEqual([]);
    expect(await queued()).toEqual([]);
    expect(
      (
        await payload.findByID({
          collection: "users",
          depth: 0,
          id: account.id,
          overrideAccess: true,
          showHiddenFields: true,
        })
      ).pendingEmailToken ?? null
    ).toBeNull();

    await payload.delete({
      collection: "users",
      id: account.id,
      overrideAccess: true,
    });
  });

  it("sends nothing for a message that names nobody", async () => {
    /*
     * Both identifiers are optional in the schema, because a message carries
     * the one its own kind needs. That makes "neither is there" a shape the
     * queue can hold — an older build's row, or a hand-written one — and the
     * handler has to answer it rather than mint a token for `undefined`.
     *
     * **The refusal is asserted through the log, and that is deliberate.**
     * Deleting the two identifier checks does not change what is sent: the
     * lookup that follows finds no row and the next guard stops it, which a
     * mutation sweep confirmed by surviving. What it *does* change is what an
     * operator is told — a malformed job reported at `error`, and actionable,
     * versus the routine `info` that says a change was already confirmed. A
     * queue quietly full of messages naming nobody is a bug in whatever is
     * queueing them, and the only way anyone finds out is this line.
     */
    for (const kind of ["email-change", "re-edit"] as const) {
      await payload.jobs.queue({
        input: { kind, locale: "nl", origin: SITE },
        task: "send-email",
      });
    }

    await runQueue();

    expect(outbox).toEqual([]);
    expect(await queued()).toEqual([]);
    expect(
      logLines.filter((line) => line.includes("named no account"))
    ).toHaveLength(1);
    expect(
      logLines.filter((line) => line.includes("named no sponsorship"))
    ).toHaveLength(1);
  });

  it("queues nothing when the status did not change", async () => {
    /*
     * Every update re-submits `status`, because Payload merges the document
     * before the hooks run. Without the comparison in
     * `hooks/queueReEditEmail.ts`, an administrator fixing a typo in a
     * sponsor's name would mail them another invitation every time.
     */
    const id = await seedSponsorship("renamed");

    // Renamed twice: once while the row is in another status, and once while
    // it is in `pending_resubmission`. Either one alone leaves half the
    // condition unexercised — the first is what a missing `doc.status` test
    // would queue, the second what a missing `previousDoc.status` test would.
    await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme renamed before ${RUN}` },
      id,
      overrideAccess: true,
    });

    expect(await queued()).toEqual([]);

    await setStatus(id, "pending_resubmission");
    await emptyQueue();

    await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme renamed again ${RUN}` },
      id,
      overrideAccess: true,
    });

    expect(await queued()).toEqual([]);
  });

  it("queues nothing for a move to any other status", async () => {
    /*
     * The hook fires on a transition *into* `pending_resubmission` and on no
     * other. Without that half of the condition every save of a sponsorship
     * that is not already in that status queues an invitation — most of them
     * harmless, because the row carries no token and the task declines to
     * send, and all of them noise in a queue whose whole job is to be small
     * enough to read. The dangerous one is the row that later *does* re-enter
     * `pending_resubmission`: a stale job then finds a live token and sends a
     * second invitation nobody asked for.
     */
    const id = await seedSponsorship("approved");

    await setStatus(id, "active");

    expect(await queued()).toEqual([]);

    // And the move that *does* queue one, so this is a narrowing rather than a
    // hook that never fires.
    const other = await seedSponsorship("asked");

    await setStatus(other, "pending_resubmission");

    expect(await queued()).toHaveLength(1);
  });

  it("queues nothing for a sponsorship created in that status", async () => {
    /*
     * `previousDoc` is `{}` on a create, so without the `operation` test every
     * fixture born in `pending_resubmission` would mail its sponsor — and
     * `manageReEditToken` deliberately leaves a create alone, so such a row
     * carries whatever token it was created with rather than a fresh one.
     */
    const gesture = await seedGesture("born");

    await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + 365 * DAY).toISOString(),
        gesture,
        originalVideoPlaybackId: `pb-mail-born-${RUN}`,
        overlayText: "Met dank aan born",
        paymentAmount: PRICE,
        reEditToken: `born-token-${RUN}`,
        sponsorEmail: `sponsor-born-${RUN}@example.test`,
        sponsorName: "Acme born",
        startDate: new Date().toISOString(),
        status: "pending_resubmission",
      },
    });

    expect(await queued()).toEqual([]);
  });
});

/** Whatever a log line was given, as something a substring search can read. */
function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, (_key, inner: unknown) =>
      inner instanceof Error
        ? { message: inner.message, name: inner.name, stack: inner.stack }
        : inner
    );
  } catch {
    return String(value);
  }
}
