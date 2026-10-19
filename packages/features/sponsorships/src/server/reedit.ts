/**
 * `sponsorships.reedit.*` (S-19, ruling 11): the link an admin's request
 * for changes issues (7 days, single use). It edits the display name and,
 * only when a logo was paid for (`payment_item.includes_logo`), the logo;
 * the gesture is locked and nothing is paid again. The submit moves
 * `changes_requested → rendering` (`resubmitted`) and creates the next
 * render job in the same D1 batch as the token's use, then enqueues
 * `render.requested` (ruling 7).
 *
 * A new logo is claimed as the checkout claims one (`claimLogo`, task 4):
 * its verified bytes are copied to a fresh key, which is the one stored,
 * so a still-valid upload URL cannot replace it and the orphan sweep never
 * sees it unreferenced. The upload is deleted after the batch; the copy if
 * the batch fails. The replaced logo is left to the daily orphan sweep.
 */
import type { Db } from "@smog/db/client";
import { enqueueOutputs } from "@smog/jobs";
import type { RpcEnv } from "@smog/rpc";
import type { LogoContentType } from "../schema/wizard";
import { claimLogo, deleteLogo, isLogoInUse, sniffLogoType } from "./logo";
import type { SponsorshipsImplementer } from "./procedure";
import { invalidState, requireOpen, tokenInvalid } from "./refusals";
import { createRenderJobStatements } from "./render";
import {
  consumeTokenStatements,
  isTokenUsed,
  type LinkSponsorship,
  readTokenLink,
} from "./token-link";
import { isStaleTransition, transitionStatements } from "./transition";

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

interface NextLogo {
  changed: boolean;
  /** The fresh copy this submit stored (deleted again if the batch fails). */
  claimed: string | null;
  logoKey: string | null;
}

/**
 * The logo the re-edit leaves: the current one, or a claimed copy of a new
 * upload. `noLogo` when no logo was paid for; `logoExpired` when the
 * upload is gone (unreferenced uploads are purged after 24 h, the link
 * lives 7 days: the page asks for a new upload); `logoInvalid` when it is
 * not a valid logo.
 */
async function nextLogo(
  db: Db,
  sponsorship: LinkSponsorship,
  upload: string | undefined,
  media: RpcEnv["MEDIA"]
): Promise<NextLogo> {
  if (upload !== undefined && !sponsorship.hasLogo) {
    throw invalidState("noLogo");
  }
  if (upload === undefined || upload === sponsorship.logoKey) {
    return { changed: false, claimed: null, logoKey: sponsorship.logoKey };
  }
  if (!media) {
    console.error(
      "[sponsorships] The MEDIA binding is missing: the re-edit logo cannot be verified"
    );
    throw invalidState("logoInvalid");
  }
  if (await isLogoInUse(db, upload)) {
    // Another sponsorship's logo (fix wave, payments M-4): never claimed
    // or deleted here.
    console.warn(
      `[sponsorships] Refused the logo ${upload} for a re-edit: a sponsorship uses it`
    );
    throw invalidState("logoInvalid");
  }
  if (!(await media.head(upload))) {
    throw invalidState("logoExpired");
  }
  const claimed = await claimLogo(media, upload);
  if (!claimed) {
    throw invalidState("logoInvalid");
  }
  return { changed: true, claimed, logoKey: claimed };
}

async function submitReedit(
  db: Db,
  env: RpcEnv,
  input: { displayName: string; logoKey?: string | undefined; token: string }
): Promise<void> {
  const now = new Date();
  const link = await openReedit(db, input.token, now);
  const { sponsorship } = link;
  const logo = await nextLogo(db, sponsorship, input.logoKey, env.MEDIA);
  const discardClaim = async () => {
    if (env.MEDIA && logo.claimed) {
      await deleteLogo(env.MEDIA, logo.claimed);
    }
  };
  const job = await createRenderJobStatements(db, {
    now,
    resubmitted: { displayName: input.displayName, logoKey: logo.logoKey },
    sponsorshipId: sponsorship.id,
  });
  if (!job) {
    await discardClaim();
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
    await discardClaim();
    if (isTokenUsed(error)) {
      throw tokenInvalid();
    }
    if (isStaleTransition(error)) {
      throw invalidState("stale");
    }
    throw error;
  }
  if (env.MEDIA && logo.changed && input.logoKey !== undefined) {
    await deleteLogo(env.MEDIA, input.logoKey);
  }
  await enqueueOutputs(
    { events: env.EVENTS_QUEUE },
    { events: job.after, notify: [] }
  );
}

/** The stored logo a re-edit keeps, as its link holder may see it. */
export interface ReeditLogo {
  bytes: Uint8Array<ArrayBuffer>;
  /** Sniffed from the bytes, never the stored metadata. */
  contentType: LogoContentType;
}

/**
 * The logo the open re-edit link `token` keeps (phase 7 task 9, task 8
 * review M-5): its own sponsorship's stored logo, so the re-edit preview
 * shows what the render will. The token is the only input (no key), so no
 * other sponsorship's logo is reachable. `null` for an unknown, used,
 * expired or renewal link, a sponsorship no longer `changes_requested`,
 * no logo, a missing object or bytes that are not a PNG, JPEG or WebP.
 * The caller answers every `null` the same way (404).
 */
export async function readReeditLogo(
  db: Db,
  media: RpcEnv["MEDIA"],
  input: { now: Date; token: string }
): Promise<ReeditLogo | null> {
  const link = await readTokenLink(db, {
    now: input.now,
    purpose: "reedit",
    raw: input.token,
  });
  if (link.kind !== "open" || link.sponsorship.status !== "changes_requested") {
    return null;
  }
  const { hasLogo, logoKey } = link.sponsorship;
  if (!(hasLogo && logoKey && media)) {
    return null;
  }
  const object = await media.get(logoKey);
  if (!object) {
    return null;
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  const contentType = sniffLogoType(bytes);
  return contentType ? { bytes, contentType } : null;
}

export function reeditProcedures(os: SponsorshipsImplementer) {
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
          hasLogo: sponsorship.hasLogo,
        };
      }),

      submit: os.reedit.submit.handler(async ({ context, input }) => {
        await submitReedit(context.db, context.env, input);
        return { submitted: true as const };
      }),
    },
  };
}
