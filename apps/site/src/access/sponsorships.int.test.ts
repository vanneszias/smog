// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * @fileoverview The re-edit token, against a real database.
 *
 * The hazard: the re-edit token is a capability URL that can outlive its
 * purpose. It is stored in the clear, carries an expiry only the access
 * filter enforces, and grants writes to a paid sponsorship. Every claim
 * here is about what the *database* answers rather than about what a function
 * returns, because the three things that can go wrong — an access filter
 * Payload silently drops, a `beforeChange` hook, and a field guard that
 * strips a column out of a document — are none of them visible to a unit
 * test of the access function's shape.
 *
 * The one to read first is `the tokenless guard`. `access/lists.ts` carries
 * `if (!token) return false;` because `{ equals: undefined }` matches every
 * row whose column is NULL, and on this collection almost every row's
 * `reEditToken` *is* NULL — a token exists only between an administrator
 * asking for a resubmission and the sponsor sending one. `tokenlessId` below
 * is kept as such a row on purpose, so deleting that guard fails a test
 * rather than passing by luck.
 */

/*
 * Unique per run: `.wrangler/state/vitest` is never cleared between runs,
 * `sponsorships.reEditToken` is `unique: true`, and a collision throws inside
 * `beforeAll` — which Vitest reports as *skipped* rather than failed, i.e. a
 * green run that asserted nothing.
 */
const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery-staple";

type Payload = Awaited<ReturnType<typeof getPayload>>;

describe("the re-edit token against a real database", () => {
  let payload: Payload;
  let gestureId: number;
  let adminId: number;

  /**
   * A sponsorship with no re-edit token at all, which is what the
   * overwhelming majority of rows look like.
   *
   * It is the whole reason the tokenless guard can be proven. Without a row
   * whose column is genuinely NULL, a mutated access function that built
   * `{ reEditToken: { equals: undefined } }` would match nothing and the
   * mutation would survive by accident. This row is the row it matches.
   */
  let tokenlessId: number;

  /**
   * A sponsorship with no token and an expiry that has not passed.
   *
   * It exists because `tokenlessId` alone cannot prove the tokenless guard,
   * and a mutation sweep is what found that out: deleting
   * `if (!token) return false;` leaves `{ reEditToken: { equals: null } }`,
   * which the query layer renders as `IS NULL` and which matches every row
   * whose token column is NULL — but every one of *those* rows also has a
   * NULL expiry, and the second conjunct excludes them. So the expiry was
   * masking the guard, and the guard looked decorative while being nothing of
   * the sort.
   *
   * This is not a contrived row. `reEditTokenExpiresAt` is an ordinary date
   * field in the admin panel with no field guard on it, while `reEditToken` is
   * `hidden: true` and cannot be typed in at all — so "an expiry in the future
   * and no token" is precisely the row an administrator produces by touching
   * that date picker.
   */
  let tokenlessWithExpiryId: number;

  const sponsor = async (
    overrides: Record<string, unknown> = {}
  ): Promise<{ id: number }> =>
    await payload.create({
      collection: "sponsorships",
      data: {
        contactCompany: `Bedrijf ${RUN}`,
        contactFullName: `Jan Janssens ${RUN}`,
        durationYears: 1,
        endDate: new Date(Date.now() + 300 * DAY).toISOString(),
        gesture: gestureId,
        invoiceEmail: `factuur-${crypto.randomUUID()}@example.com`,
        invoiceName: `Acme NV ${RUN}`,
        invoiceRequested: true,
        invoiceVatNumber: "0417497106",
        originalVideoPlaybackId: `pb-re-edit-${RUN}`,
        overlayText: `Met dank aan Acme ${RUN}`,
        paymentAmount: 5000,
        sponsorEmail: `sponsor-${crypto.randomUUID()}@example.com`,
        sponsorName: `Acme ${RUN}`,
        startDate: new Date().toISOString(),
        status: "pending_approval",
        ...overrides,
      },
      overrideAccess: true,
    });

  /** A sponsorship sitting in `pending_resubmission` with a live link. */
  const withLiveToken = async (overrides: Record<string, unknown> = {}) => {
    const token = crypto.randomUUID();
    const row = await sponsor({
      reEditToken: token,
      reEditTokenExpiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
      status: "pending_resubmission",
      ...overrides,
    });

    return { id: row.id, token };
  };

  /** What a browser following a re-edit link asks the database. */
  const findAs = async (options: { token?: string; admin?: boolean }) =>
    await payload.find({
      collection: "sponsorships",
      disableErrors: true,
      // Well past the number of sponsorships one run creates. Payload's
      // default of ten would silently drop the row a `toContain` is looking
      // for and turn a passing guard into a coin flip.
      limit: 100,
      overrideAccess: false,
      req: {
        searchParams: new URLSearchParams(
          options.token === undefined ? {} : { reEditToken: options.token }
        ),
      },
      user: options.admin
        ? { collection: "users", id: adminId, role: "admin" }
        : undefined,
    });

  /** The raw row, hidden columns and all, as only server-side code can read it. */
  const readRaw = async (id: number) =>
    await payload.findByID({
      collection: "sponsorships",
      id,
      overrideAccess: true,
      showHiddenFields: true,
    });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Herwerking ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Herwerking ${RUN}`,
        playbackId: `pb-re-edit-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const admin = await payload.create({
      collection: "users",
      data: {
        email: `re-edit-admin-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    adminId = admin.id;

    const tokenless = await sponsor();
    tokenlessId = tokenless.id;

    const dated = await sponsor({
      reEditTokenExpiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
    });
    tokenlessWithExpiryId = dated.id;
  });

  describe("the tokenless guard", () => {
    it("has a sponsorship with no token at all on hand, which the tests below depend on", async () => {
      // Asserted rather than assumed. If a future change ever started minting
      // a token on create, the two tests below would quietly become vacuous:
      // with every row carrying a token, `{ equals: undefined }` matches
      // nothing and a mutation that deletes the guard survives by luck. This
      // fails first and says why.
      const raw = await readRaw(tokenlessId);

      expect(raw.reEditToken).toBeNull();
      expect(raw.reEditTokenExpiresAt).toBeNull();
    });

    it("refuses an absent token without matching every NULL-token row", async () => {
      // The trap `access/lists.ts` documents: without `if (!token) return
      // false` this builds `{ reEditToken: { equals: undefined } }`, which
      // the query layer matches against every row whose column is NULL.
      // `tokenlessId` is such a row, so this assertion is the one that
      // notices — and what it would hand over is a sponsor's email, contact
      // name, invoice name and VAT number.
      const result = await findAs({});

      expect(result.docs).toHaveLength(0);
    });

    it("has a tokenless row whose expiry is still in the future, which is what makes the guard the only door", async () => {
      const raw = await readRaw(tokenlessWithExpiryId);

      expect(raw.reEditToken).toBeNull();
      expect(new Date(raw.reEditTokenExpiresAt ?? 0).getTime()).toBeGreaterThan(
        Date.now()
      );
    });

    it("refuses an absent token even when a tokenless row has an unexpired expiry", async () => {
      // Without `if (!token) return false` the filter is
      // `{ reEditToken: { equals: null } }`, which is `IS NULL`, and this row
      // is the one it matches that the expiry conjunct does not also throw
      // away. It is the assertion that makes the tokenless guard
      // load-bearing rather than merely defensible.
      const result = await findAs({});

      expect(result.docs.map((doc) => doc.id)).not.toContain(
        tokenlessWithExpiryId
      );
    });

    it("refuses a blank token", async () => {
      const result = await findAs({ token: "   " });

      expect(result.docs).toHaveLength(0);
    });

    it("accepts a token with the whitespace a mail client wrapped it in", async () => {
      // The positive half of the same normalisation: `.trim()` is not only
      // about refusing blanks, it is what makes a link copied out of a mail
      // with a trailing newline still work. Without it this request builds
      // `{ equals: "<uuid> " }` and the sponsor is told their link is dead.
      const { id, token } = await withLiveToken();

      const result = await findAs({ token: ` ${token}\n` });

      expect(result.docs.map((doc) => doc.id)).toEqual([id]);
    });

    it("cannot reach the tokenless sponsorship with any token at all", async () => {
      const result = await findAs({ token: crypto.randomUUID() });

      expect(result.docs.map((doc) => doc.id)).not.toContain(tokenlessId);
    });
  });

  describe("following a live link", () => {
    it("lets the token holder read their own sponsorship", async () => {
      const { id, token } = await withLiveToken();

      const result = await findAs({ token });

      expect(result.docs.map((doc) => doc.id)).toEqual([id]);
    });

    it("shows them nothing else in the collection", async () => {
      const { token } = await withLiveToken();
      // A second live link exists at the same time, so "one row" is a real
      // filter rather than an artefact of there being one row to find.
      await withLiveToken();

      const result = await findAs({ token });

      expect(result.docs).toHaveLength(1);
      expect(result.totalDocs).toBe(1);
    });

    it("does not hand the token itself back", async () => {
      const { token } = await withLiveToken();

      const [doc] = (await findAs({ token })).docs;

      // `hidden: true`. The whole point of storing it in the clear is that
      // server-side code can rebuild the link; an API response is not that.
      expect(doc?.reEditToken).toBeUndefined();
    });

    it("does not expose the sponsor's contact details to a token holder", async () => {
      const { token } = await withLiveToken();

      const [doc] = (await findAs({ token })).docs;

      // The positive half, beside the negative one: this is the same read,
      // and it did return the two fields the re-edit form is built from. So
      // the absences below are the field guard, not a failed read.
      expect(doc?.sponsorName).toBe(`Acme ${RUN}`);
      expect(doc?.overlayText).toBe(`Met dank aan Acme ${RUN}`);

      expect(doc?.sponsorEmail).toBeUndefined();
      expect(doc?.contactFullName).toBeUndefined();
      expect(doc?.contactCompany).toBeUndefined();
      expect(doc?.invoiceName).toBeUndefined();
      expect(doc?.invoiceVatNumber).toBeUndefined();
      expect(doc?.invoiceEmail).toBeUndefined();
    });

    it("does not expose who reviewed the sponsorship, or why", async () => {
      const { token } = await withLiveToken({
        rejectionReason: "Het logo is onleesbaar op zwart.",
        reviewedAt: new Date().toISOString(),
        reviewedBy: adminId,
      });

      const [doc] = (await findAs({ token })).docs;

      expect(doc?.sponsorName).toBe(`Acme ${RUN}`);
      expect(doc?.rejectionReason).toBeUndefined();
      expect(doc?.reviewedBy).toBeUndefined();
      expect(doc?.reviewedAt).toBeUndefined();
    });

    it("shows an administrator everything the token holder cannot see", async () => {
      const { id } = await withLiveToken();

      const [doc] = (await findAs({ admin: true })).docs.filter(
        (row) => row.id === id
      );

      expect(doc?.contactFullName).toBe(`Jan Janssens ${RUN}`);
      expect(doc?.invoiceVatNumber).toBe("0417497106");
    });
  });

  describe("expiry", () => {
    it("refuses an expired token, and accepted the same one before it expired", async () => {
      const { id, token } = await withLiveToken();

      // The positive case first, on the same token and the same row, so that
      // the refusal below cannot be a token which never matched.
      expect((await findAs({ token })).docs.map((doc) => doc.id)).toEqual([id]);

      await payload.update({
        collection: "sponsorships",
        data: {
          reEditTokenExpiresAt: new Date(Date.now() - DAY).toISOString(),
        },
        id,
        overrideAccess: true,
      });

      expect(await findAs({ token })).toMatchObject({ docs: [] });
    });

    it("refuses a token whose expiry was never set", async () => {
      // `reEditTokenExpiresAt` is nullable and nothing makes it `required`,
      // so which way a NULL falls is a decision. It falls closed: SQL's `>`
      // is false against NULL, and a capability with no end is the thing the
      // expiry exists to prevent.
      const token = crypto.randomUUID();

      await sponsor({ reEditToken: token, status: "pending_resubmission" });

      expect((await findAs({ token })).docs).toHaveLength(0);
    });
  });

  describe("minting and destroying", () => {
    it("mints a token and an expiry when a sponsorship enters pending_resubmission", async () => {
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_resubmission" },
        id: row.id,
        overrideAccess: true,
      });

      const raw = await readRaw(row.id);

      expect(raw.reEditToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(
        new Date(raw.reEditTokenExpiresAt ?? 0).getTime() - Date.now()
      ).toBeGreaterThan(6 * DAY);
    });

    it("mints a token for a rejected sponsorship too", async () => {
      // `rejected -> pending_resubmission` is the edge `generateReEditLink`'s
      // allowlist establishes, and re-opening a rejected sponsorship is the
      // case the re-edit link exists for most often.
      const row = await sponsor({ status: "rejected" });

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_resubmission" },
        id: row.id,
        overrideAccess: true,
      });

      expect((await readRaw(row.id)).reEditToken).not.toBeNull();
    });

    it("mints a different token for every sponsorship", async () => {
      const [first, second] = await Promise.all([sponsor(), sponsor()]);

      for (const row of [first, second]) {
        await payload.update({
          collection: "sponsorships",
          data: { status: "pending_resubmission" },
          id: row.id,
          overrideAccess: true,
        });
      }

      const [a, b] = await Promise.all([readRaw(first.id), readRaw(second.id)]);

      expect(a.reEditToken).not.toBe(b.reEditToken);
    });

    it("leaves the token alone on an edit that is not a transition", async () => {
      const { id, token } = await withLiveToken();

      await payload.update({
        collection: "sponsorships",
        data: { sponsorName: `Acme hernoemd ${RUN}` },
        id,
        overrideAccess: true,
      });

      expect((await readRaw(id)).reEditToken).toBe(token);
    });

    it("refuses a token that has been used to resubmit", async () => {
      const { id, token } = await withLiveToken();

      expect((await findAs({ token })).docs).toHaveLength(1);

      // What `POST /api/sponsor/re-edit` does to the row: back to the queue.
      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_approval" },
        id,
        overrideAccess: true,
      });

      expect((await readRaw(id)).reEditToken).toBeNull();
      expect((await findAs({ token })).docs).toHaveLength(0);
    });

    it("destroys the token when an admin cancels instead", async () => {
      // `pending_resubmission -> cancelled` is legal, and a token that
      // survived it would be a live link to a sponsorship nobody is running.
      const { id, token } = await withLiveToken();

      await payload.update({
        collection: "sponsorships",
        data: { status: "cancelled" },
        id,
        overrideAccess: true,
      });

      expect((await findAs({ token })).docs).toHaveLength(0);
    });
  });

  describe("what the token cannot do", () => {
    /** A write attempted by the token holder, exactly as REST would make it. */
    const updateAs = (
      id: number,
      token: string,
      data: Record<string, unknown>
    ) =>
      payload.update({
        collection: "sponsorships",
        data,
        id,
        overrideAccess: false,
        req: { searchParams: new URLSearchParams({ reEditToken: token }) },
      });

    it("refuses the token holder every write, including a harmless one", async () => {
      // The unmasked case, and the one that proves `access.update` rather
      // than something downstream of it: renaming the sponsor is a change no
      // status rule and no field guard would object to.
      const { id, token } = await withLiveToken();

      await expect(
        updateAs(id, token, { sponsorName: `Gekaapt ${RUN}` })
      ).rejects.toThrow();

      expect((await readRaw(id)).sponsorName).toBe(`Acme ${RUN}`);
    });

    it("does not let the token change the status to active", async () => {
      const { id, token } = await withLiveToken();

      await expect(updateAs(id, token, { status: "active" })).rejects.toThrow();

      expect((await readRaw(id)).status).toBe("pending_resubmission");
    });

    it("does not let the token change the payment amount or the gesture", async () => {
      const { id, token } = await withLiveToken();

      await expect(
        updateAs(id, token, { gesture: gestureId, paymentAmount: 1 })
      ).rejects.toThrow();

      expect((await readRaw(id)).paymentAmount).toBe(5000);
    });

    it("does not let the token delete the sponsorship", async () => {
      const { id, token } = await withLiveToken();

      await expect(
        payload.delete({
          collection: "sponsorships",
          id,
          overrideAccess: false,
          req: { searchParams: new URLSearchParams({ reEditToken: token }) },
        })
      ).rejects.toThrow();

      expect((await readRaw(id)).id).toBe(id);
    });
  });
});
