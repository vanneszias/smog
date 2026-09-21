import { FIXED_DURATION_YEARS } from "@smog/config/constants";
import {
  type Endpoint,
  generateCookie,
  type PayloadHandler,
  type PayloadRequest,
} from "payload";
import {
  isEmailShaped,
  localeFromForm,
  seeOther,
  sponsorDetailsPath,
  sponsorPath,
  sponsorPreviewPath,
  sponsorReEditPath,
  sponsorSuccessPath,
} from "@/lib/authFlow";
import { field, guardOrigin, readForm } from "@/lib/formPost";
import { createMolliePayment } from "@/lib/mollie";
import { sponsorshipAmountCents } from "@/lib/pricing";
import { findSponsorshipByReEditToken } from "@/lib/reEdit";
import { submitRenderJob } from "@/lib/renderJob";
import {
  encodeSponsorDraft,
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  MAX_SPONSOR_NAME,
  readSponsorDetails,
  SPONSOR_DRAFT_COOKIE,
  SPONSOR_DRAFT_TTL_SECONDS,
  type SponsorDetails,
} from "@/lib/sponsorDraft";
import { resolveSponsorSelection } from "@/lib/sponsorSelection";
import { createSponsorship } from "@/lib/sponsorshipCreate";
import type { Gesture, Sponsorship } from "@/payload-types";

/**
 * The sponsor wizard's writes.
 *
 * ## Why these are endpoints and not `app/**​/route.ts`
 *
 * The same measurement as `endpoints/auth.ts`, `endpoints/account.ts` and
 * `endpoints/lists.ts`: a Next route handler that imports Payload becomes its
 * own bundle entry and re-bundles the Payload/D1/drizzle graph into it,
 * measured at **+519 KiB gzipped** against a budget with a few hundred KiB
 * left. `app/(payload)/api/[...slug]/route.ts` already carries that graph, so
 * a handler hung off it costs only the handler, and the public paths are
 * rewrites in `next.config.ts`, which bundle nothing. A CI check fails the
 * build on a route handler that imports Payload.
 *
 * ## There is no sign-in check anywhere in this file, and that is the product
 *
 * Every other write in this app begins with "who is this". Sponsoring does
 * not: `apps/web/src/routes/sponsors/` is reachable by anyone, collects the
 * sponsor's contact details in the form itself, and the shipped oRPC
 * procedures behind it are `publicProcedure`. A sponsor is a company buying
 * one thing once, not an account. So the thing that stands in for
 * authentication here is that **nothing the form says is believed**: every
 * gesture id is resolved against real rows with `overrideAccess: false`,
 * every field is bounded and re-checked, the price is computed from the
 * resolved selection rather than read from the body, and the status is fixed
 * by `lib/sponsorshipCreate.ts` rather than posted.
 *
 * `guardOrigin` still runs first on every handler. It is not an
 * authentication check — it is what stops another site from driving this
 * wizard from a visitor's browser.
 */

/** The form field every selected gesture's checkbox shares. */
const SPONSOR_SELECTION_FIELD = "gestureId";

/** The rewrite source Mollie is handed, not the endpoint's own `/api/` path. */
const MOLLIE_WEBHOOK_PATH = "/webhooks/mollie";

/** Origins Mollie cannot reach, so it is never offered a webhook for them. */
const LOCAL_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "localhost"]);

/** One day, for the term arithmetic the shipped mutation does. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The shipped term: `Date.now() + durationYears * 365 * 24 * 60 * 60 * 1000`. */
const DAYS_PER_YEAR = 365;

/** Which extension a stored logo gets, by the type it was accepted as. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The three ways a logo can be refused. */
type LogoRefusal = "logo" | "logo-size" | "logo-type";

/**
 * The selection a form carries.
 *
 * `getAll`, because a set of checkboxes with one name is how a form says "a
 * list" — and `FormData.get` would silently take the first, turning a
 * ten-gesture order into a one-gesture one at the till. A `File` entry cannot
 * be a gesture id, so anything that is not a string is dropped here rather
 * than stringified into `"[object File]"` and looked up.
 */
function selectedGestureIds(form: FormData): string[] {
  return form
    .getAll(SPONSOR_SELECTION_FIELD)
    .filter((value): value is string => typeof value === "string");
}

/**
 * The draft cookie, built the way `endpoints/oauth.ts` builds its `state`
 * cookie: through Payload's own `generateCookie`, with `domain` and `secure`
 * taken from the users collection's cookie config so this app has one answer
 * to "what does a cookie from this site look like".
 *
 * `Lax` rather than `Strict`: the sponsor arrives at step 3 by a same-site
 * redirect, which `Lax` covers, and `None` would ship a draft of somebody's
 * contact details on any cross-site request at all.
 */
function draftCookie(req: PayloadRequest, value: string): string {
  const cookies = req.payload.collections.users?.config.auth.cookies;

  return generateCookie({
    domain: cookies?.domain ?? undefined,
    httpOnly: true,
    maxAge: SPONSOR_DRAFT_TTL_SECONDS,
    name: SPONSOR_DRAFT_COOKIE,
    path: "/",
    returnCookieAsObject: false,
    sameSite: "Lax",
    secure: cookies?.secure,
    value,
  }) as string;
}

/**
 * Where Mollie should announce this payment's fate, or `undefined`.
 *
 * **Omitted for a local origin, and that is not a convenience.** Mollie
 * refuses a `webhookUrl` it cannot reach, and it refuses the whole payment
 * with it — so a developer running `bun -F site dev` would get no checkout at
 * all rather than a checkout with no webhook. The shipped flow makes the same
 * exception with `baseUrl.includes("localhost")`; this matches on the host
 * rather than on a substring, so a real domain with "localhost" in its name
 * still gets its webhook.
 *
 * The path is the rewrite source in `next.config.ts`, not the endpoint's own
 * `/api/...` path: Mollie holds this URL for weeks and posts back to whatever
 * it was given.
 */
function webhookUrlFor(origin: string): string | undefined {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }

  return LOCAL_HOSTS.has(url.hostname)
    ? undefined
    : `${url.origin}${MOLLIE_WEBHOOK_PATH}`;
}

/**
 * The sponsor's logo in `media`, or the code that refuses the file.
 *
 * **Nothing is uploaded unless the logo was asked for.** `hasLogo` records
 * whether the option was *paid* for — `packages/convex/convex/schema.ts` says
 * so in as many words and `lib/sponsorOverlay.ts` gates the public overlay on
 * exactly that pair — so a file posted alongside an unticked box is dropped,
 * not stored.
 *
 * **`overrideAccess: true` on a write an anonymous visitor caused.**
 * `media.create` is `isAdmin`, deliberately: Stage 3 closed a hole where one
 * signup bought arbitrary R2 uploads. Sponsoring needs no account at all, so
 * the access layer cannot be what authorises this — what stands in for it is
 * the pair of checks above the create, which bound the file to 2 MB and to
 * three image types *before* anything reaches R2. That leaves an
 * unauthenticated upload surface, bounded at 2 MB a request; it is the same
 * surface the shipped `generatePreview` procedure exposes, and Stage 7's
 * cleanup is where an unreferenced upload should eventually be swept.
 *
 * The stored filename is this app's, not the browser's. A client-supplied
 * name is a client-supplied R2 key, and two sponsors uploading `logo.png`
 * should not be one sponsor overwriting the other.
 */
async function storeLogo(
  req: PayloadRequest,
  file: File,
  sponsorName: string
): Promise<{ error: LogoRefusal } | { mediaId: string }> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return { error: "logo-type" };
  }

  if (file.size > MAX_LOGO_BYTES) {
    return { error: "logo-size" };
  }

  const media = await req.payload.create({
    collection: "media",
    data: { alt: `Logo van ${sponsorName}` },
    file: {
      data: Buffer.from(await file.arrayBuffer()),
      mimetype: file.type,
      name: `sponsor-logo-${crypto.randomUUID()}.${EXTENSIONS[file.type] ?? "bin"}`,
      size: file.size,
    },
    overrideAccess: true,
  });

  return { mediaId: String(media.id) };
}

async function uploadLogo(
  req: PayloadRequest,
  form: FormData,
  details: SponsorDetails
): Promise<{ error: LogoRefusal } | { mediaId: null | string }> {
  if (!details.wantsLogo) {
    return { mediaId: null };
  }

  const file = form.get("logo");

  // An empty part is what a browser sends for a file input nobody touched,
  // so "no file" and "a zero-byte file" are the same mistake and get the same
  // sentence.
  if (!(file instanceof File) || file.size === 0) {
    return { error: "logo" };
  }

  return await storeLogo(req, file, details.sponsorName);
}

/**
 * The logo the preview step says was uploaded, resolved against `media`.
 *
 * The id arrives in a hidden field, so it is a number a stranger can type.
 * `overlayImage` carries a real foreign key, which means an id for a row that
 * does not exist is an unhandled `DrizzleQueryError` — a 500 with a JSON body
 * in a browser window, on a page whose every other refusal is a sentence.
 * Resolving it first is the difference, and it is the Global Constraint the
 * spec states for every id that arrives in a request.
 *
 * It resolves to *any* media row, because `media.read` is public and always
 * has been — the worst a forged id buys is a sponsorship whose overlay names
 * an image already served to everybody, and an administrator approves every
 * sponsorship before it goes live.
 */
async function resolveLogo(
  req: PayloadRequest,
  details: SponsorDetails,
  mediaId: string
): Promise<{ error: LogoRefusal } | { overlayImage: null | number }> {
  if (!details.wantsLogo) {
    return { overlayImage: null };
  }

  if (mediaId === "") {
    return { error: "logo" };
  }

  const media = await req.payload.findByID({
    collection: "media",
    depth: 0,
    disableErrors: true,
    id: mediaId,
    overrideAccess: false,
  });

  return media === null ? { error: "logo" } : { overlayImage: media.id };
}

/**
 * One sponsorship row per selected gesture, all in `pending_payment`.
 *
 * ## Why one row per gesture, and what `paymentAmount` means
 *
 * Transcribed from `createBulkSimplified` in
 * `packages/convex/convex/sponsorships.ts`: a sponsorship is a contract
 * about exactly one gesture's video for a term, so three gestures is three
 * rows and one payment, not one row naming three. `paymentAmount` is therefore the
 * **per-gesture** amount and not the order total — which is exactly what
 * `endpoints/mollie.ts` assumes when it sums it across a payment's
 * sponsorships and compares the sum with what Mollie charged. Writing the
 * total on each row would make a three-gesture order look like it cost three
 * times what it did, and the webhook would refuse the payment the sponsor
 * had already made.
 *
 * ## The two dates
 *
 * `startDate` is now and `endDate` is now plus the term, both written here.
 * The shipped mutation writes `startDate: 0` and fills it in after payment;
 * this column is `required` in Payload and — more to the point — nothing in
 * this app ever sets it later, so a sentinel would make every sponsorship
 * fail `lib/sponsorOverlay.ts`'s in-term test for ever. Now is honest: the
 * term this sponsor is buying starts when they buy it.
 *
 * ## Sequentially, not `Promise.all`
 *
 * Ten rows against D1 through one HTTP-shaped binding. Concurrency here buys
 * a few milliseconds and costs the one thing worth having if this dies
 * half-way: a prefix of the order written, in a known order, rather than an
 * arbitrary subset.
 */
function createSponsorships(
  req: PayloadRequest,
  gestures: readonly Gesture[],
  order: { details: SponsorDetails; overlayImage: null | number }
): Promise<Sponsorship[]> {
  const startedAt = Date.now();
  const startDate = new Date(startedAt).toISOString();
  const endDate = new Date(
    startedAt + FIXED_DURATION_YEARS * DAYS_PER_YEAR * DAY_MS
  ).toISOString();
  const { details } = order;
  const perGestureCents = sponsorshipAmountCents(1, details.wantsLogo);

  return gestures.reduce<Promise<Sponsorship[]>>(
    (chain, gesture) =>
      chain.then(async (rows) => [
        ...rows,
        await createSponsorship(req.payload, {
          contactCompany:
            details.contactCompany === "" ? null : details.contactCompany,
          contactFullName: details.contactFullName,
          durationYears: FIXED_DURATION_YEARS,
          endDate,
          gesture: gesture.id,
          hasLogo: details.wantsLogo,
          invoiceEmail:
            details.invoiceEmail === "" ? null : details.invoiceEmail,
          invoiceName: details.invoiceName === "" ? null : details.invoiceName,
          invoiceRequested: details.invoiceRequested,
          invoiceVatNumber:
            details.invoiceVatNumber === "" ? null : details.invoiceVatNumber,
          // The gesture's own video, kept so Stage 6 can put it back when the
          // term ends and so the preview step has something to play.
          originalVideoPlaybackId: gesture.playbackId,
          overlayImage: order.overlayImage,
          /*
           * **The overlay text is the sponsor name**, because that is what
           * the shipped wizard sends: one input, two columns. See
           * `lib/sponsorDraft.ts` — there is no second field in the product
           * and adding one here would be a change to it.
           */
          overlayText: details.sponsorName,
          paymentAmount: perGestureCents,
          sponsorEmail: details.sponsorEmail,
          sponsorName: details.sponsorName,
          startDate,
        }),
      ]),
    Promise.resolve([])
  );
}

/**
 * The sponsor's logo as an absolute URL, or `null`.
 *
 * Absolute because the consumer is a Remotion composition running in AWS,
 * which has no origin of its own to resolve `/api/media/file/...` against.
 * `disableErrors` rather than a try/catch: the id came from `resolveLogo`,
 * which already resolved it against a real row, so a miss here means the row
 * went away between two reads and is worth a `null` rather than a 500 on a
 * checkout somebody is paying for.
 */
async function logoUrlFor(
  req: PayloadRequest,
  mediaId: null | number
): Promise<null | string> {
  if (mediaId === null) {
    return null;
  }

  const media = await req.payload.findByID({
    collection: "media",
    depth: 0,
    disableErrors: true,
    id: mediaId,
    overrideAccess: true,
  });
  const url = media?.url;

  if (typeof url !== "string" || url === "") {
    return null;
  }

  return url.startsWith("/") ? `${req.origin ?? ""}${url}` : url;
}

/**
 * Asks for a composited video of every gesture this checkout just sold.
 *
 * ## Why a failure here cannot fail the checkout
 *
 * The sponsor has an open Mollie payment by the time this runs. A video
 * pipeline that is unconfigured, unreachable or simply not built yet must not
 * be able to turn that into an error page: the purchase is complete, the rows
 * exist, and a missing composite is something an operator can chase from the
 * log line below. So every refusal is caught and named, and the redirect
 * happens either way.
 *
 * ## What it does today, stated plainly
 *
 * Nothing is submitted. `lib/renderJob.ts` is a seam with an empty transport —
 * there is no deployed Remotion Lambda, and the plan's "BLOCKED ON
 * CREDENTIALS" forbids this task from creating one — so each call records that
 * no render was submitted and for which sponsorship. Task 6 fills the seam and
 * this loop does not change.
 *
 * Sequentially rather than `Promise.all`, for the reason `createSponsorships`
 * gives about D1: concurrency here buys milliseconds and costs a known order
 * if something dies half way.
 */
async function submitRenders(
  req: PayloadRequest,
  created: readonly Sponsorship[],
  logoUrl: null | string
): Promise<void> {
  const now = Date.now();

  for (const sponsorship of created) {
    try {
      await submitRenderJob(req.payload, {
        logoUrl,
        now,
        origin: req.origin ?? "",
        overlayText: sponsorship.overlayText,
        playbackId: sponsorship.originalVideoPlaybackId,
        sponsorshipId: sponsorship.id,
      });
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        `[sponsorships] No render could be submitted for sponsorship ${sponsorship.id}; it is paid for and has no composited video`
      );
    }
  }
}

/**
 * `POST /api/sponsor/start` — step 1's only write, which writes nothing.
 *
 * It resolves the selection and hands it to step 2 in the URL. The check has
 * to happen server-side even though step 2 and `checkout` both repeat it,
 * because the selection screen's checkboxes are a *hint*: a sold-out gesture
 * is rendered without one, and a form is not a security boundary.
 *
 * Every answer is a 303, like every other form post in this app, so the page
 * survives a reload and works with scripting off.
 */
const startSponsorship: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  /*
   * `getAll`, because a set of checkboxes with one name is how a form says
   * "a list" — and `FormData.get` would silently take the first, turning a
   * ten-gesture order into a one-gesture one at the till. A `File` entry
   * cannot be a gesture id, so anything that is not a string is dropped
   * here rather than stringified into `"[object File]"` and looked up.
   */
  const selected = form
    .getAll(SPONSOR_SELECTION_FIELD)
    .filter((value): value is string => typeof value === "string");

  const selection = await resolveSponsorSelection(req.payload, selected);

  if ("error" in selection) {
    return seeOther(sponsorPath(locale, { error: selection.error }));
  }

  return seeOther(
    sponsorDetailsPath(
      locale,
      selection.gestures.map((gesture) => gesture.id)
    )
  );
};

/**
 * `POST /api/sponsor/details` — step 2.
 *
 * It writes exactly one thing, and only when it has to: the logo, into
 * `media`. The sponsorship rows are deliberately *not* created here. A
 * sponsor who fills this form and closes the tab is the common case, and a
 * row created at this step would sit in `pending_payment` blocking its
 * gesture until Stage 7's `cleanup-stale-payments` exists to sweep it —
 * which, today, is never.
 *
 * Everything else travels to step 3 in the draft cookie. See
 * `lib/sponsorDraft.ts` for why it is a cookie and not the query string, and
 * why it is not signed.
 */
const submitDetails: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const selection = await resolveSponsorSelection(
    req.payload,
    selectedGestureIds(form)
  );

  /*
   * A bad selection goes back to step 1, not to step 2: step 2 has nothing
   * to show without gestures, and the thing the sponsor has to fix is on the
   * page before this one.
   */
  if ("error" in selection) {
    return seeOther(sponsorPath(locale, { error: selection.error }));
  }

  const gestureIds = selection.gestures.map((gesture) => String(gesture.id));
  const details = readSponsorDetails(form, isEmailShaped);

  if ("error" in details) {
    return seeOther(
      sponsorDetailsPath(locale, gestureIds, { error: details.error })
    );
  }

  const logo = await uploadLogo(req, form, details);

  if ("error" in logo) {
    return seeOther(
      sponsorDetailsPath(locale, gestureIds, { error: logo.error })
    );
  }

  return seeOther(
    sponsorPreviewPath(locale),
    draftCookie(
      req,
      encodeSponsorDraft({ ...details, gestureIds, logoMediaId: logo.mediaId })
    )
  );
};

/**
 * `POST /api/sponsor/checkout` — step 3, and the only handler here that costs
 * anybody money.
 *
 * ## Nothing from step 2 is trusted, because nothing can be
 *
 * Every field arrives again as a hidden input and is validated again with the
 * same functions step 2 used, the gestures are resolved again with
 * `overrideAccess: false`, their availability is checked again, and the
 * amount is computed from the resolved selection rather than read from the
 * body. Not defence in depth: this endpoint is reachable directly, the draft
 * cookie is not signed, and minutes can pass between step 2 and step 3 — in
 * which somebody else can buy one of the gestures.
 *
 * ## The ordering, with no transactions to lean on
 *
 * The rows are written first and the payment second, because the payment's
 * metadata has to name the rows — that is the only thing that lets the
 * webhook work out what a payment paid for. So:
 *
 * 1. N sponsorship rows, in `pending_payment`, with no `molliePaymentId`.
 * 2. One Mollie payment naming all N.
 * 3. `molliePaymentId` written onto all N.
 * 4. The sponsor is sent to Mollie.
 *
 * **If step 2 fails, the rows stay.** That is the correct outcome and not an
 * oversight: deleting them would be a second multi-step write with no
 * transaction behind it either, and a half-done delete leaves rows that
 * are worse still than the ones it was cleaning up. What the rows are is exactly what
 * Stage 7's `cleanup-stale-payments` collects — `pending_payment`, no payment
 * id, older than its window — and `sponsorships.int.test.ts` asserts that
 * shape by name rather than asserting "nothing happened".
 *
 * **If step 3 fails, the sponsor still goes to Mollie.** They have a payment
 * open and must be able to pay it; the webhook resolves through
 * `metadata.sponsorshipIds` and not through this column, so the payment still
 * lands. The failure is logged, which is all an operator needs.
 */
const checkout: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const selection = await resolveSponsorSelection(
    req.payload,
    selectedGestureIds(form)
  );

  if ("error" in selection) {
    return seeOther(sponsorPath(locale, { error: selection.error }));
  }

  const gestureIds = selection.gestures.map((gesture) => String(gesture.id));
  const details = readSponsorDetails(form, isEmailShaped);

  if ("error" in details) {
    return seeOther(
      sponsorDetailsPath(locale, gestureIds, { error: details.error })
    );
  }

  const logo = await resolveLogo(req, details, field(form, "logoMediaId"));

  if ("error" in logo) {
    return seeOther(
      sponsorDetailsPath(locale, gestureIds, { error: logo.error })
    );
  }

  const created = await createSponsorships(req, selection.gestures, {
    details,
    overlayImage: logo.overlayImage,
  });

  // Resolved once for the whole order: one checkout carries one logo, and the
  // renders below all draw it.
  const logoUrl = await logoUrlFor(req, logo.overlayImage);

  const ids = created.map((sponsorship) => String(sponsorship.id));

  let payment: Awaited<ReturnType<typeof createMolliePayment>>;

  try {
    payment = await createMolliePayment({
      /*
       * The order total, from the same function that priced each row, so the
       * webhook's `sum(paymentAmount) === payment.amount` comparison holds by
       * construction rather than by agreement between two call sites.
       */
      amountCents: sponsorshipAmountCents(
        selection.gestures.length,
        details.wantsLogo
      ),
      description: `Sponsorship for ${ids.length} gesture(s)`,
      redirectUrl: `${req.origin ?? ""}${sponsorSuccessPath(locale)}`,
      sponsorshipIds: ids,
      webhookUrl: webhookUrlFor(req.origin ?? ""),
    });
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `[sponsorships] Mollie would not open a checkout for ${ids.join(", ")}; they stay in pending_payment with no payment id`
    );

    return seeOther(sponsorPreviewPath(locale, { error: "payment" }));
  }

  const { errors } = await req.payload.update({
    collection: "sponsorships",
    data: { molliePaymentId: payment.id },
    overrideAccess: true,
    where: { id: { in: ids } },
  });

  if (errors.length > 0) {
    // Logged and not answered: the sponsor has a checkout open, and the
    // webhook resolves through the payment's metadata rather than through
    // this column, so the payment still lands on the right rows.
    req.payload.logger.error(
      `[sponsorships] Payment ${payment.id} could not be written onto ${errors.map((e) => e.id).join(", ")}`
    );
  }

  /*
   * After the payment, and deliberately not before it. A render costs Lambda
   * time and Mux storage, and a checkout that never reaches Mollie is a
   * sponsor who changed their mind at the till — so the order is the same one
   * the whole file uses: the irreversible, billable step last, and only once
   * everything that could refuse the sale has.
   */
  await submitRenders(req, created, logoUrl);

  return seeOther(payment.checkoutUrl);
};

/**
 * `POST /api/sponsor/re-edit` — the sponsor's one write after paying.
 *
 * An administrator who wants a change moves the sponsorship to
 * `pending_resubmission`, which mints a token
 * (`hooks/manageReEditToken.ts`); the sponsor follows the link, edits the
 * overlay text and the logo, and posts here, which puts the row back in the
 * approval queue and destroys the token.
 *
 * ## The token is the whole of the authorisation, and it is checked by a read
 *
 * `findSponsorshipByReEditToken` runs with `overrideAccess: false`, so
 * `access/sponsorships.ts` decides — which is what enforces the expiry, and
 * the reason `reEditTokenExpiresAt` stopped being a column nobody reads. It
 * is also why nothing below re-derives "is this token still good": there is
 * one rule and one place it lives.
 *
 * The write that follows runs with `overrideAccess: true`, which is
 * deliberate and is the narrower of the two available designs.
 * `sponsorships.update` is `isAdmin`, so the alternative would be widening it
 * to the token holder and then fencing off, field by field, the twenty-odd
 * columns they must not touch — `paymentAmount`, `gesture`, `status`,
 * `reviewedBy`, the dates — where one missing guard is a sponsor editing
 * their own price. Here the set of fields a sponsor can change is the literal
 * below, and `status` moves exactly one step, which
 * `hooks/enforceStatusTransitions.ts` checks again underneath.
 *
 * ## Order, with no transactions to lean on
 *
 * The logo is stored first and the sponsorship updated second, so a failure
 * between them leaves an unreferenced `media` row rather than a sponsorship
 * pointing at an upload that does not exist. That is the same direction
 * `checkout` orders its two writes in, for the same reason, and the leftover
 * is what Stage 7's cleanup collects.
 */
const reEdit: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const token = field(form, "token").trim();
  const sponsorship = await findSponsorshipByReEditToken(req.payload, token);

  /*
   * No token in the redirect, and no error code either. A token that no
   * longer resolves is spent, expired or invented, and the page says so on
   * its own when it is asked to render without one — so "this link is no
   * longer valid" is written once, on the page, rather than twice.
   */
  if (sponsorship === null) {
    return seeOther(sponsorReEditPath(locale));
  }

  /*
   * Transcribed from `reSubmitSponsorshipVideo` in
   * `packages/convex/convex/sponsorships.ts`, which refuses the same way.
   * `manageReEditToken` clears the token whenever a sponsorship leaves
   * `pending_resubmission`, so a live token on any other status is a row that
   * was *created* holding one — a fixture, an admin, or Stage 9's import —
   * rather than one the flow produced. Without this, such a token would move
   * a rejected sponsorship into the approval queue without anybody asking
   * for a resubmission.
   */
  if (sponsorship.status !== "pending_resubmission") {
    return seeOther(sponsorReEditPath(locale));
  }

  const sponsorName = field(form, "sponsorName").trim();

  if (sponsorName === "" || sponsorName.length > MAX_SPONSOR_NAME) {
    return seeOther(sponsorReEditPath(locale, { error: "name", token }));
  }

  const file = form.get("logo");

  /*
   * A replacement logo, and only for a sponsorship that paid for one.
   * `hasLogo` records whether the option was *bought* —
   * `packages/convex/convex/schema.ts` says so in as many words and
   * `lib/sponsorOverlay.ts` gates the public overlay on exactly that pair —
   * so a file posted against a sponsorship without it is dropped rather than
   * stored, which is the same rule `uploadLogo` applies at step 2 to a file
   * posted alongside an unticked box. An empty part is what a browser sends
   * for a file input nobody touched, and here it means "keep the logo I
   * already have" rather than the refusal it means at step 2.
   */
  let overlayImage: number | undefined;

  if (sponsorship.hasLogo === true && file instanceof File && file.size > 0) {
    const stored = await storeLogo(req, file, sponsorName);

    if ("error" in stored) {
      return seeOther(
        sponsorReEditPath(locale, { error: stored.error, token })
      );
    }

    overlayImage = Number(stored.mediaId);
  }

  await req.payload.update({
    collection: "sponsorships",
    data: {
      ...(overlayImage === undefined ? {} : { overlayImage }),
      /*
       * One input, two columns, exactly as step 2 writes them: the shipped
       * wizard collects `sponsorName` once and sends
       * `overlayText: form.sponsorName`. A second input here would be a
       * field the product does not have.
       */
      overlayText: sponsorName,
      sponsorName,
      /*
       * Back to the queue. `manageReEditToken` clears the token and its
       * expiry on the way out, which is what makes the link one-shot, and
       * `logSponsorshipTransitions` files the move in `admin-logs`.
       */
      status: "pending_approval",
    },
    id: sponsorship.id,
    overrideAccess: true,
    req,
  });

  return seeOther(sponsorReEditPath(locale, { notice: "sent" }));
};

export const sponsorshipEndpoints: Endpoint[] = [
  { handler: startSponsorship, method: "post", path: "/sponsor/start" },
  { handler: submitDetails, method: "post", path: "/sponsor/details" },
  { handler: checkout, method: "post", path: "/sponsor/checkout" },
  { handler: reEdit, method: "post", path: "/sponsor/re-edit" },
];
