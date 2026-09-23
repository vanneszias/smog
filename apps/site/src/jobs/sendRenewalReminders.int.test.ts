// @vitest-environment node
import { getPayload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sendRenewalReminders } from "@/jobs/sendRenewalReminders";
import type { Sponsorship } from "@/payload-types";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, so
 * a fixture keyed on a fixed name collides with an earlier run's row. A
 * collision throws inside `beforeAll`, which Vitest reports as *skipped*
 * rather than failed — a file that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;
const WINDOW_DAYS = 30;

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
 * `send-renewal-reminders` — never twice and never dropped, against a real
 * database and a real queue.
 *
 * The whole of this file is about the two ways `renewalReminderSentAt` can
 * be got wrong, and they pull in opposite directions:
 *
 * - **written too eagerly** and a reminder that was refused is filed as sent.
 *   The sponsorship lapses, nobody was asked, and there is no trace — the
 *   column says the sponsor was told.
 * - **not written at all, or written and then ignored** and the sponsor is
 *   asked twice, which is the failure the column exists to prevent.
 *
 * So the sweep queues and `jobs/sendEmail.ts` stamps, after the send. The
 * mechanism that stops a *second* reminder is therefore the stamp read at send
 * time, and the candidate query's filter is an optimisation on top of it — a
 * distinction the tests below keep separate, because a job deferred by a quota
 * refusal is still in the queue when the next day's sweep runs, so two jobs for
 * one sponsorship is the ordinary case rather than the exceptional one.
 *
 * `payload.sendEmail` is replaced with an outbox, so **nothing here is
 * evidence about Cloudflare.** The queue, the retry counting, the backoff and
 * the cancellation are Payload's own.
 */
describe("reminding a sponsor that their term is nearly up", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  let outbox: SentMessage[] = [];
  /**
   * What the next send does, given the address it is for.
   *
   * The address matters because a sweep is global: a run that refuses every
   * send refuses the other sponsorships this file has seeded too, so a bare
   * call counter would count them and a bound of four would read as twelve.
   * It did, before this took an argument.
   */
  let nextSend: (to: string) => Promise<void> = () => Promise.resolve();
  let realSendEmail: typeof payload.sendEmail;

  const seedSponsorship = async (
    label: string,
    options: {
      endsInDays?: number;
      remindedAt?: string;
      status?: Sponsorship["status"];
    } = {}
  ): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Gebaar ${label} ${RUN}`,
        playbackId: `pb-renew-${label}-${RUN}`,
      },
      locale: "nl",
    });
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: `Contact ${label}`,
        durationYears: 1,
        endDate: new Date(
          Date.now() + (options.endsInDays ?? 10) * DAY
        ).toISOString(),
        gesture: gesture.id,
        originalVideoPlaybackId: `pb-renew-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        renewalReminderSentAt: options.remindedAt ?? null,
        sponsorEmail: `renew-${label}-${RUN}@example.test`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(Date.now() - DAY).toISOString(),
        status: options.status ?? "active",
      },
    });

    return row.id;
  };

  const reload = (id: number) =>
    payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
      overrideAccess: true,
    }) as Promise<Sponsorship>;

  const mailTo = (label: string) =>
    outbox.filter((sent) => sent.to === `renew-${label}-${RUN}@example.test`);

  /** Every `send-email` job still in the queue for this sponsorship. */
  const messagesFor = async (id: number) => {
    const { docs } = await payload.find({
      collection: "payload-jobs",
      depth: 0,
      limit: 50,
      overrideAccess: true,
      where: { taskSlug: { equals: "send-email" } },
    });

    return docs.filter(
      (job) => (job.input as { sponsorshipId?: number })?.sponsorshipId === id
    );
  };

  /** Runs the queue once, exactly as `GET /api/jobs/run` does. */
  const runQueue = () =>
    payload.jobs.run({
      limit: 25,
      overrideAccess: true,
      queue: "default",
      sequential: true,
    });

  const clearBackoff = async () => {
    const { docs } = await payload.find({
      collection: "payload-jobs",
      depth: 0,
      limit: 50,
      overrideAccess: true,
    });

    for (const job of docs) {
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

  const sweep = (now: Date = new Date()) =>
    sendRenewalReminders(payload, now, SITE);

  beforeAll(async () => {
    payload = await getPayload({ config });

    /*
     * Every sponsorship this file has ever seeded, from every earlier run.
     *
     * `.wrangler/state/vitest` is persisted and `RUN` is new each time, so an
     * `active` row inside the window that this file deliberately never
     * reminded — the bounced one, the hopeless one, the one whose queueing was
     * refused — is a row every future sweep picks up again. Left alone they
     * make each run's sweep larger than the last.
     */
    await payload.delete({
      collection: "sponsorships",
      overrideAccess: true,
      where: { sponsorEmail: { like: "renew-" } },
    });

    realSendEmail = payload.sendEmail;
    payload.sendEmail = (async (message: {
      subject?: string;
      text?: unknown;
      to?: unknown;
    }) => {
      await nextSend(String(message.to ?? ""));
      outbox.push({
        subject: message.subject ?? "",
        text: String(message.text ?? ""),
        to: String(message.to ?? ""),
      });

      return { accepted: true };
    }) as typeof payload.sendEmail;

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Renew ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(async () => {
    outbox = [];
    nextSend = () => Promise.resolve();
    await emptyQueue();
  });

  afterAll(async () => {
    payload.sendEmail = realSendEmail;
    await emptyQueue();
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);

    const id = await seedSponsorship("boot");

    // And the premise every assertion below rests on: a fresh sponsorship has
    // never been reminded. If this were ever false the "second reminder" tests
    // would pass without the guard existing.
    expect((await reload(id)).renewalReminderSentAt ?? null).toBeNull();
  });

  it("sends one reminder about thirty days before expiry", async () => {
    const id = await seedSponsorship("soon", { endsInDays: 20 });

    const report = await sweep();

    expect(report.queued).toBeGreaterThanOrEqual(1);
    expect(report.failures).toBe(0);
    expect(await messagesFor(id)).toHaveLength(1);

    await runQueue();

    const [sent] = mailTo("soon");

    expect(sent).toBeDefined();
    expect(sent?.subject).toBe("Je SMOG-sponsoring verloopt binnenkort");
    // The three things the message says, so this is the message and
    // not merely a message: who it is to, which gesture, and when it ends.
    expect(sent?.text).toContain("Contact soon");
    expect(sent?.text).toContain(`Gebaar soon ${RUN}`);
    expect(sent?.text).toContain(`${SITE}/nl/sponsor`);
  });

  it("writes renewalReminderSentAt", async () => {
    /*
     * The column is written by the *send* and not by the sweep, which is the
     * difference between "a sponsor was asked" and "a message was accepted for
     * delivery".
     */
    const id = await seedSponsorship("stamp");

    await sweep();

    // Queued, and still unstamped: the sweep does not get to claim the
    // reminder happened.
    expect((await reload(id)).renewalReminderSentAt ?? null).toBeNull();

    await runQueue();

    const stamped = (await reload(id)).renewalReminderSentAt;

    expect(stamped).toBeTruthy();
    expect(Date.parse(String(stamped))).toBeLessThanOrEqual(Date.now());
    expect(mailTo("stamp")).toHaveLength(1);
  });

  it("does not send a second reminder", async () => {
    /*
     * The reason the column exists. **Two different mechanisms could stop a
     * second reminder and a test that simply ran the sweep twice would not say
     * which one did**, so they are separated.
     *
     * The stamp read at send time first, because that is the guard. The
     * sponsorship below is left exactly as the candidate query wants it — it
     * is even re-offered to the queue by hand — and the only thing standing
     * between it and a second message is `jobs/sendEmail.ts` reading the
     * column back.
     */
    const id = await seedSponsorship("once");

    await sweep();
    await runQueue();

    expect(mailTo("once")).toHaveLength(1);

    // A second job for the same sponsorship, which is the ordinary state of
    // affairs after a deferral: yesterday's message is still in the queue when
    // today's sweep runs.
    await payload.jobs.queue({
      input: {
        kind: "renewal-reminder",
        locale: "nl",
        origin: SITE,
        sponsorshipId: id,
      },
      task: "send-email",
    });

    await runQueue();

    expect(mailTo("once")).toHaveLength(1);

    /*
     * And the candidate query second, which is the optimisation: the stamped
     * row is no longer offered at all, so this run is stopped before anything
     * is queued rather than before anything is sent.
     */
    await sweep();

    expect(await messagesFor(id)).toEqual([]);
  });

  it("does not remind a cancelled or expired sponsorship", async () => {
    /*
     * Two rows, because the statuses arrive here by different routes: a
     * cancelled sponsorship may still be well inside its term, and an expired
     * one has had `expire-sponsorships` run over it. Neither is somebody to
     * ask about renewing.
     */
    const cancelled = await seedSponsorship("cancelled", {
      status: "cancelled",
    });
    const expired = await seedSponsorship("expired", { status: "expired" });

    await sweep();
    await runQueue();

    expect(mailTo("cancelled")).toEqual([]);
    expect(mailTo("expired")).toEqual([]);
    expect((await reload(cancelled)).renewalReminderSentAt ?? null).toBeNull();
    expect((await reload(expired)).renewalReminderSentAt ?? null).toBeNull();

    /*
     * And the guard is at send time as well as in the query, which is the half
     * that matters: a sponsorship cancelled *after* its reminder was queued is
     * the race this closes, and the candidate query has already run by then.
     */
    const live = await seedSponsorship("withdrawn");

    await sweep();
    await payload.update({
      collection: "sponsorships",
      data: { status: "cancelled" },
      id: live,
      overrideAccess: true,
    });
    await runQueue();

    expect(mailTo("withdrawn")).toEqual([]);
    expect((await reload(live)).renewalReminderSentAt ?? null).toBeNull();
  });

  it("does not remind a sponsorship whose term has already run out", async () => {
    /*
     * Not the same condition as `expired`, and that is the point. The status
     * only moves once `expire-sponsorships` has run, so between the end of the
     * term and the next nightly sweep there is a row that is `active` and out
     * of term — and the message would tell its sponsor their sponsorship ends
     * on a date that has passed.
     */
    const id = await seedSponsorship("lapsed", { endsInDays: -1 });

    await sweep();

    expect(await messagesFor(id)).toEqual([]);

    // And the send refuses it too, so the guard is not only in the query.
    await payload.jobs.queue({
      input: {
        kind: "renewal-reminder",
        locale: "nl",
        origin: SITE,
        sponsorshipId: id,
      },
      task: "send-email",
    });
    await runQueue();

    expect(mailTo("lapsed")).toEqual([]);
  });

  it("leaves a sponsorship just outside the window alone, and takes one just inside", async () => {
    /*
     * The boundary, asserted rather than assumed. Thirty days is the window,
     * and `<` against `<=` is the whole of whether a sponsor is asked a day
     * early or a day late.
     *
     * The window is moved rather than the rows, for the reason
     * `cleanupStalePayments.int.test.ts` gives: `endDate` is real data here,
     * so the honest lever is the `now` the sweep is given.
     */
    const id = await seedSponsorship("edge", { endsInDays: 60 });
    const endsAt = Date.parse((await reload(id)).endDate);

    await sweep(new Date(endsAt - WINDOW_DAYS * DAY - 1));

    expect(await messagesFor(id)).toEqual([]);

    // One millisecond later it is inside, so this is a boundary rather than a
    // sweep that never selects anything.
    await sweep(new Date(endsAt - WINDOW_DAYS * DAY));

    expect(await messagesFor(id)).toHaveLength(1);
  });

  it("defers rather than drops when the daily quota is refused", async () => {
    /*
     * `E_DAILY_LIMIT_EXCEEDED` says nothing about this sponsorship. A reminder
     * that is deferred arrives a day late; one that is dropped is a renewal
     * nobody was asked for — and a stamp written by the sweep would have made
     * the two indistinguishable for ever.
     *
     * The assertion is on the job row rather than on a retry happening,
     * because "still runnable, later" is the state that makes the retry
     * inevitable.
     */
    const id = await seedSponsorship("quota");

    nextSend = () => Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    await sweep();
    await runQueue();

    const [deferred] = await messagesFor(id);

    expect(outbox).toEqual([]);
    expect(deferred).toBeDefined();
    expect(deferred?.hasError ?? false).toBe(false);
    expect(deferred?.totalTried).toBe(1);
    expect(Date.parse(String(deferred?.waitUntil))).toBeGreaterThan(Date.now());

    // **And the column is still empty**, which is the half of this that
    // matters most: a deferred reminder must not look like a sent one.
    expect((await reload(id)).renewalReminderSentAt ?? null).toBeNull();

    // Then the retry really does send, rather than merely being permitted to.
    nextSend = () => Promise.resolve();
    await clearBackoff();
    await runQueue();

    expect(mailTo("quota")).toHaveLength(1);
    expect((await reload(id)).renewalReminderSentAt).toBeTruthy();
    expect(await messagesFor(id)).toEqual([]);
  });

  it("gives up on a reminder nothing can deliver, without recording one", async () => {
    /*
     * The other end of the same policy. A refusal that will refuse again stops
     * at once (`E_RECIPIENT_SUPPRESSED`), and a transient one that never stops
     * being transient stops after four executions — `retries.attempts: 3`
     * counts retries, not tries. Either way the column stays empty, so the
     * sponsorship is offered again by tomorrow's sweep rather than silently
     * recorded as handled.
     */
    const bounced = await seedSponsorship("bounced");

    nextSend = () => Promise.reject(refusal("E_RECIPIENT_SUPPRESSED"));
    await sweep();
    await runQueue();

    const [cancelled] = await messagesFor(bounced);

    expect(cancelled?.hasError).toBe(true);
    expect((cancelled?.error as { cancelled?: boolean })?.cancelled).toBe(true);
    expect((await reload(bounced)).renewalReminderSentAt ?? null).toBeNull();

    // And tomorrow's sweep offers it again, which is the consequence of not
    // stamping: an address that was suppressed by mistake is not written off
    // for ever by one refusal.
    await emptyQueue();
    nextSend = () => Promise.resolve();
    await sweep();

    expect(await messagesFor(bounced)).toHaveLength(1);

    // The bounded half, on its own row so the two mechanisms stay apart.
    const hopeless = await seedSponsorship("hopeless");
    let calls = 0;

    nextSend = (to) => {
      if (to === `renew-hopeless-${RUN}@example.test`) {
        calls += 1;
      }

      return Promise.reject(refusal("E_DAILY_LIMIT_EXCEEDED"));
    };
    await sweep();

    for (let attempt = 0; attempt < BOUNDED_ATTEMPTS + 2; attempt += 1) {
      await clearBackoff();
      await runQueue();
    }

    const [exhausted] = await messagesFor(hopeless);

    expect(calls).toBe(BOUNDED_ATTEMPTS);
    expect(exhausted?.hasError).toBe(true);
    expect(JSON.stringify(exhausted?.error)).toContain(
      "E_DAILY_LIMIT_EXCEEDED"
    );
    expect((await reload(hopeless)).renewalReminderSentAt ?? null).toBeNull();
  });

  it("carries on after one sponsorship cannot be queued", async () => {
    /*
     * A sweep that gave up on its first failure would leave every sponsorship
     * behind the failing one unasked, for as long as the failure lasted — and
     * the whole point of a sweep is that it is the only thing that will ever
     * look.
     */
    const first = await seedSponsorship("broken", { endsInDays: 3 });
    const second = await seedSponsorship("after", { endsInDays: 4 });

    const realQueue = payload.jobs.queue.bind(payload.jobs);
    let refused = false;

    payload.jobs.queue = (async (args: Parameters<typeof realQueue>[0]) => {
      if (
        !refused &&
        (args.input as { sponsorshipId?: number })?.sponsorshipId === first
      ) {
        refused = true;

        throw new Error("the queue said no");
      }

      return await realQueue(args);
    }) as typeof payload.jobs.queue;

    let report: Awaited<ReturnType<typeof sweep>>;

    try {
      report = await sweep();
    } finally {
      payload.jobs.queue = realQueue;
    }

    expect(refused).toBe(true);
    expect(report.failures).toBe(1);
    expect(await messagesFor(first)).toEqual([]);
    expect(await messagesFor(second)).toHaveLength(1);
  });
});
