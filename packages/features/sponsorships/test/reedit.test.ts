/**
 * The re-edit link (S-19, ruling 11): `sponsorships.reedit.get` and
 * `reedit.submit`, through the router with its guards, the bucket and a
 * recording events queue.
 */
import { env } from "cloudflare:workers";
import { type AnyProcedure, call } from "@orpc/server";
import { renderJob, sponsorshipToken } from "@smog/db";
import type { EventMessage, QueueProducer } from "@smog/jobs";
import { FAKE_MOLLIE_API_KEY } from "@smog/payments/testing";
import { renderInputSchema } from "@smog/render/contract";
import { makeRpcContext } from "@smog/rpc/testing";
import { DAY_MS, newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { requestChangesStatements } from "../src/server/lifecycle";
import { fakeRenderStarter } from "../src/server/render";
import { createSponsorshipsRouter } from "../src/server/router";
import { clearBucket } from "./clean";
import {
  eventsOf,
  makeAdmin,
  SITE_URL,
  seedCheckout,
  sponsorshipRow,
  testDb,
} from "./helpers";

const db = testDb();
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3,
]);

let messages: EventMessage[];
const queue: QueueProducer<EventMessage> = {
  send: (body) => {
    messages.push(body);
    return Promise.resolve();
  },
};
const router = createSponsorshipsRouter({
  bindings: () => ({ EVENTS_QUEUE: queue, MEDIA: env.MEDIA }),
});

async function reedit<T>(path: "get" | "submit", input: unknown): Promise<T> {
  const procedure = router.reedit[path] as unknown as AnyProcedure;
  return (await call(procedure, input, {
    context: makeRpcContext({
      db,
      env: { MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY },
      kv: env.KV,
    }),
    path: ["sponsorships", "reedit", path],
  })) as T;
}

/** The error a call failed with (`code`, `data`), or `"ok"`. */
async function failure(result: Promise<unknown>) {
  try {
    await result;
    return "ok";
  } catch (error) {
    const { code, data } = error as { code?: string; data?: unknown };
    return { code, data };
  }
}

/** A sponsorship in `changes_requested` with an open re-edit link. */
async function changesRequested(logo = true) {
  const seeded = await seedCheckout(db, {
    count: 1,
    logo,
    paymentStatus: "paid",
    status: "in_review",
    videoPlaybackId: "playback-1",
  });
  const id = seeded.sponsorshipIds[0] as string;
  const admin = await makeAdmin(db);
  const plan = await requestChangesStatements(db, {
    actorId: admin.id,
    now: new Date(),
    siteUrl: SITE_URL,
    sponsorshipId: id,
  });
  await db.batch(plan.statements as never);
  return { gesture: seeded.gestures[0], id, token: plan.token };
}

async function upload(bytes: Uint8Array = PNG, type = "image/png") {
  const key = `logos/${newId()}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  return key;
}

beforeEach(async () => {
  messages = [];
  await clearBucket(env.MEDIA);
});

describe("sponsorships.reedit.get", () => {
  it("shows what the link may change", async () => {
    const { gesture, id, token } = await changesRequested();

    const view = await reedit<{
      displayName: string;
      expiresAt: number;
      gesture: { name: string; slug: string };
      hasLogo: boolean;
    }>("get", { token });

    expect(view).toMatchObject({
      displayName: "Acme BV",
      gesture: { name: gesture?.name, slug: gesture?.slug },
      hasLogo: true,
    });
    const [row] = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(view.expiresAt).toBe(row?.expiresAt.getTime());
  });

  it("refuses an unknown, a used and an expired link", async () => {
    expect(await failure(reedit("get", { token: "b".repeat(43) }))).toEqual({
      code: "TOKEN_INVALID",
      data: undefined,
    });

    const used = await changesRequested();
    await db
      .update(sponsorshipToken)
      .set({ usedAt: new Date() })
      .where(eq(sponsorshipToken.sponsorshipId, used.id));
    expect(await failure(reedit("get", { token: used.token }))).toMatchObject({
      code: "TOKEN_INVALID",
    });

    const expired = await changesRequested();
    const at = new Date(Date.now() - DAY_MS);
    await db
      .update(sponsorshipToken)
      .set({ expiresAt: at })
      .where(eq(sponsorshipToken.sponsorshipId, expired.id));
    expect(await failure(reedit("get", { token: expired.token }))).toEqual({
      code: "TOKEN_EXPIRED",
      data: { expiresAt: at.getTime() },
    });
  });

  it("refuses a renewal link", async () => {
    const { id } = await changesRequested();
    const raw = "c".repeat(43);
    const { hashSponsorshipToken } = await import("../src/schema");
    await db.insert(sponsorshipToken).values({
      expiresAt: new Date(Date.now() + DAY_MS),
      id: newId(),
      purpose: "renewal",
      sponsorshipId: id,
      tokenHash: await hashSponsorshipToken(raw),
    });

    expect(await failure(reedit("get", { token: raw }))).toMatchObject({
      code: "TOKEN_INVALID",
    });
  });
});

describe("sponsorships.reedit.submit", () => {
  it("resubmits: the token used, the new name and logo, one render job, one render.requested", async () => {
    const { id, token } = await changesRequested();
    const before = await sponsorshipRow(db, id);
    await env.MEDIA.put(before.logoKey as string, PNG, {
      httpMetadata: { contentType: "image/png" },
    });
    const logoKey = await upload();

    const result = await reedit("submit", {
      displayName: "Acme NV",
      logoKey,
      token,
    });

    expect(result).toEqual({ submitted: true });
    const row = await sponsorshipRow(db, id);
    expect(row).toMatchObject({
      displayName: "Acme NV",
      logoKey,
      status: "rendering",
    });
    // The old object stays for the orphan sweep (ruling 9).
    expect(await env.MEDIA.head(before.logoKey as string)).not.toBeNull();
    const [tokenRow] = await db
      .select()
      .from(sponsorshipToken)
      .where(eq(sponsorshipToken.sponsorshipId, id));
    expect(tokenRow?.usedAt).not.toBeNull();
    const jobs = await db
      .select()
      .from(renderJob)
      .where(eq(renderJob.sponsorshipId, id));
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    expect(renderInputSchema.parse(job?.input)).toMatchObject({
      displayName: "Acme NV",
      logoKey,
    });
    expect(messages).toEqual([
      { renderJobId: job?.id, type: "render.requested" },
    ]);
    const trail = (await eventsOf(db, id)).map((event) => event.type);
    expect(trail.slice(-2)).toEqual(["resubmitted", "render_started"]);
    const resubmitted = (await eventsOf(db, id)).find(
      (event) => event.type === "resubmitted"
    );
    expect(resubmitted?.data).toEqual({
      displayNameChanged: true,
      logoChanged: true,
    });

    // The fake render (ruling 7) brings it to the moderation queue.
    await fakeRenderStarter(db).start({
      input: renderInputSchema.parse(job?.input),
      renderJobId: job?.id as string,
    });
    expect((await sponsorshipRow(db, id)).status).toBe("in_review");
  });

  it("is single use: the second submit is TOKEN_INVALID and changes nothing", async () => {
    const { id, token } = await changesRequested(false);

    await reedit("submit", { displayName: "Eerste", token });
    const second = await failure(
      reedit("submit", { displayName: "Tweede", token })
    );

    expect(second).toMatchObject({ code: "TOKEN_INVALID" });
    expect((await sponsorshipRow(db, id)).displayName).toBe("Eerste");
    expect(messages).toHaveLength(1);
    const jobs = await db
      .select()
      .from(renderJob)
      .where(eq(renderJob.sponsorshipId, id));
    expect(jobs).toHaveLength(1);
  });

  it("refuses a logo when the sponsorship has none (noLogo), and writes nothing", async () => {
    const { id, token } = await changesRequested(false);
    const logoKey = await upload();

    expect(
      await failure(reedit("submit", { displayName: "Acme", logoKey, token }))
    ).toEqual({ code: "INVALID_STATE", data: { reason: "noLogo" } });
    expect((await sponsorshipRow(db, id)).status).toBe("changes_requested");
    expect(messages).toEqual([]);
    // The link still works.
    expect(await failure(reedit("get", { token }))).toBe("ok");
  });

  it("refuses a missing or forged logo object (logoInvalid)", async () => {
    const { id, token } = await changesRequested();
    const missing = `logos/${newId()}`;
    const gif = await upload(
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]),
      "image/png"
    );

    const results = await Promise.all(
      [missing, gif].map((logoKey) =>
        failure(reedit("submit", { displayName: "Acme", logoKey, token }))
      )
    );
    expect(results).toEqual([
      { code: "INVALID_STATE", data: { reason: "logoInvalid" } },
      { code: "INVALID_STATE", data: { reason: "logoInvalid" } },
    ]);
    expect((await sponsorshipRow(db, id)).status).toBe("changes_requested");
  });

  it("keeps the logo when none is sent, and refuses a used, expired or unknown link", async () => {
    const { id, token } = await changesRequested();
    const before = await sponsorshipRow(db, id);
    await reedit("submit", { displayName: "Acme BV", token });
    const row = await sponsorshipRow(db, id);
    expect(row.logoKey).toBe(before.logoKey);
    const resubmitted = (await eventsOf(db, id)).find(
      (event) => event.type === "resubmitted"
    );
    expect(resubmitted?.data).toEqual({
      displayNameChanged: false,
      logoChanged: false,
    });

    expect(
      await failure(
        reedit("submit", { displayName: "X", token: "d".repeat(43) })
      )
    ).toMatchObject({ code: "TOKEN_INVALID" });
    const expired = await changesRequested();
    await db
      .update(sponsorshipToken)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(sponsorshipToken.sponsorshipId, expired.id));
    expect(
      await failure(
        reedit("submit", { displayName: "X", token: expired.token })
      )
    ).toMatchObject({ code: "TOKEN_EXPIRED" });
    expect((await sponsorshipRow(db, expired.id)).status).toBe(
      "changes_requested"
    );
  });
});
