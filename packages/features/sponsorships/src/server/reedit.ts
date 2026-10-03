/**
 * `sponsorships.reedit.*` (S-19, ruling 11): the link an admin's request
 * for changes issues (7 days, single use). It edits the display name and,
 * only when the sponsorship has a logo, the logo; the gesture is locked
 * and nothing is paid again. The submit moves `changes_requested →
 * rendering` (`resubmitted`) and creates the next render job in the same
 * D1 batch as the token's use, then enqueues `render.requested` (ruling 7).
 * A replaced logo object is left to the daily orphan sweep (ruling 9).
 */
import type { Db } from "@smog/db/client";
import { enqueueEvent } from "@smog/jobs";
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from "../schema/wizard";
import { type SponsorshipBindings, workerBindings } from "./bindings";
import type { SponsorshipsDeps, SponsorshipsImplementer } from "./procedure";
import { invalidState, requireOpen, tokenInvalid } from "./refusals";
import { createRenderJobStatements, type RenderJobPlan } from "./render";
import {
  consumeTokenStatements,
  isTokenUsed,
  type LinkSponsorship,
  readTokenLink,
} from "./token-link";
import { isStaleTransition, transitionStatements } from "./transition";

/** The first bytes of the three logo types (ruling 10). */
const SIGNATURES: readonly (readonly (number | null)[])[] = [
  // PNG
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // JPEG
  [0xff, 0xd8, 0xff],
  // WebP: "RIFF", the size, "WEBP"
  [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
];
const SIGNATURE_BYTES = 12;

function hasImageSignature(bytes: Uint8Array): boolean {
  return SIGNATURES.some(
    (signature) =>
      bytes.length >= signature.length &&
      signature.every((byte, i) => byte === null || bytes[i] === byte)
  );
}

/**
 * Whether the uploaded logo object is one the checkout would accept
 * (ruling 10): present, at most 2 MiB, one of the three types, and with
 * that type's signature. An invalid object is not deleted here: no
 * sponsorship references it, so the orphan sweep removes it after 24 h.
 */
async function logoIsValid(
  media: SponsorshipBindings["MEDIA"],
  key: string
): Promise<boolean> {
  if (!media) {
    console.error(
      "[sponsorships] No MEDIA binding: a re-edit logo cannot be checked"
    );
    return false;
  }
  const head = await media.head(key);
  const type = head?.httpMetadata?.contentType ?? "";
  if (
    !head ||
    head.size > LOGO_MAX_BYTES ||
    !(LOGO_CONTENT_TYPES as readonly string[]).includes(type)
  ) {
    return false;
  }
  const body = await media.get(key, {
    range: { length: SIGNATURE_BYTES, offset: 0 },
  });
  if (!body) {
    return false;
  }
  return hasImageSignature(new Uint8Array(await body.arrayBuffer()));
}

/** The open re-edit link of a sponsorship waiting for changes. */
async function openReedit(db: Db, raw: string, now: Date) {
  const link = requireOpen(
    await readTokenLink(db, { now, purpose: "reedit", raw })
  );
  if (link.sponsorship.status !== "changes_requested") {
    throw tokenInvalid();
  }
  return link;
}

/**
 * The logo the re-edit leaves: the current one, or a new upload that
 * passes the checkout's checks (`noLogo` without a logo to replace,
 * `logoInvalid` for a missing or forged object).
 */
async function nextLogo(
  sponsorship: LinkSponsorship,
  logoKey: string | undefined,
  media: SponsorshipBindings["MEDIA"]
): Promise<{ changed: boolean; logoKey: string | null }> {
  if (logoKey !== undefined && sponsorship.logoKey === null) {
    throw invalidState("noLogo");
  }
  if (logoKey === undefined || logoKey === sponsorship.logoKey) {
    return { changed: false, logoKey: sponsorship.logoKey };
  }
  if (!(await logoIsValid(media, logoKey))) {
    throw invalidState("logoInvalid");
  }
  return { changed: true, logoKey };
}

/** `render.requested` for the new job, after the batch (ruling 8). */
async function requestRender(
  job: RenderJobPlan,
  queue: SponsorshipBindings["EVENTS_QUEUE"]
): Promise<void> {
  if (!queue) {
    console.error(
      `[sponsorships] No EVENTS_QUEUE: render job ${job.renderJobId} stays queued`
    );
    return;
  }
  for (const event of job.after) {
    // biome-ignore lint/performance/noAwaitInLoops: one message per job.
    await enqueueEvent(queue, event);
  }
}

async function submitReedit(
  db: Db,
  bindings: SponsorshipBindings,
  input: { displayName: string; logoKey?: string | undefined; token: string }
): Promise<void> {
  const now = new Date();
  const link = await openReedit(db, input.token, now);
  const { sponsorship } = link;
  const logo = await nextLogo(sponsorship, input.logoKey, bindings.MEDIA);
  const job = await createRenderJobStatements(db, {
    now,
    resubmitted: { displayName: input.displayName, logoKey: logo.logoKey },
    sponsorshipId: sponsorship.id,
  });
  if (!job) {
    throw invalidState("stale");
  }
  try {
    await db.batch([
      ...consumeTokenStatements(db, { now, tokenId: link.tokenId }),
      ...transitionStatements(db, {
        actorId: null,
        data: {
          displayNameChanged: input.displayName !== sponsorship.displayName,
          logoChanged: logo.changed,
        },
        event: "resubmitted",
        from: "changes_requested",
        now,
        patch: { displayName: input.displayName, logoKey: logo.logoKey },
        sponsorshipId: sponsorship.id,
      }),
      ...job.statements,
    ]);
  } catch (error) {
    if (isTokenUsed(error)) {
      throw tokenInvalid();
    }
    if (isStaleTransition(error)) {
      throw invalidState("stale");
    }
    throw error;
  }
  await requestRender(job, bindings.EVENTS_QUEUE);
}

export function reeditProcedures(
  os: SponsorshipsImplementer,
  deps: SponsorshipsDeps
) {
  const bindings = deps.bindings ?? workerBindings;
  return {
    reedit: {
      get: os.reedit.get.handler(async ({ context, input }) => {
        const link = await openReedit(context.db, input.token, new Date());
        const { sponsorship } = link;
        return {
          displayName: sponsorship.displayName,
          expiresAt: link.expiresAt.getTime(),
          gesture: {
            name: sponsorship.gestureName,
            slug: sponsorship.gestureSlug,
          },
          hasLogo: sponsorship.logoKey !== null,
        };
      }),

      submit: os.reedit.submit.handler(async ({ context, input }) => {
        await submitReedit(context.db, bindings(), input);
        return { submitted: true as const };
      }),
    },
  };
}
