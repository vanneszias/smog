import type { Endpoint, PayloadHandler } from "payload";
import {
  localeFromForm,
  seeOther,
  sponsorDetailsPath,
  sponsorPath,
} from "@/lib/authFlow";
import { guardOrigin, readForm } from "@/lib/formPost";
import { resolveSponsorSelection } from "@/lib/sponsorSelection";

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

export const sponsorshipEndpoints: Endpoint[] = [
  { handler: startSponsorship, method: "post", path: "/sponsor/start" },
];
