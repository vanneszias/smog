import type { CollectionBeforeDeleteHook } from "payload";
import { APIError } from "payload";
import type { Sponsorship } from "@/payload-types";

/**
 * How many sponsorships to name individually before summarising the rest.
 *
 * The message has to be actionable, not exhaustive: an admin needs enough to
 * go and find the rows, and a gesture with more than a handful of sponsors
 * would otherwise produce an error nobody can read.
 */
const MAX_NAMED = 5;

/** HTTP 400. Anything other than 500 makes `APIError` public by default, but
 * `isPublic` is passed explicitly below rather than relying on that. */
const BAD_REQUEST = 400;

const ISO_DATE_LENGTH = 10;

/**
 * `#12 "Acme NV" (active, ends 2027-01-01)` — the id to open the row, the
 * sponsor to recognise it, the status to know whether it is live, and the
 * end date to know whether waiting is an option.
 */
const describeSponsorship = (sponsorship: Sponsorship): string => {
  const endsOn = String(sponsorship.endDate).slice(0, ISO_DATE_LENGTH);
  return `#${sponsorship.id} "${sponsorship.sponsorName}" (${sponsorship.status}, ends ${endsOn})`;
};

/**
 * Refuses to delete a gesture that any sponsorship points at.
 *
 * Payload emits `sponsorships.gesture` as `NOT NULL` with
 * `ON DELETE set null`, which SQLite cannot honour: the delete fails with a
 * raw `Failed query: delete from "gestures" where ...` that tells the admin
 * nothing. Refusing is also the behaviour the spec's decision table asks for
 * — someone paid for the sponsorship, so a row pointing at nothing is worse
 * than a blocked delete — so this hook replaces an accidental failure with a
 * deliberate one that names what is in the way.
 *
 * It runs after `access.delete` (see `collections/operations/deleteByID.js`,
 * 3.89.0), so a non-admin still gets `Forbidden` rather than a list of
 * sponsor names.
 *
 * `APIError` with an explicit `isPublic` is not decoration. The bulk delete
 * path does not rethrow: it collects `{ id, isPublic, message }` per document
 * (`collections/operations/delete.js`, 3.89.0) and only surfaces the message
 * when `isErrorPublic` agrees, which outside `config.debug` means a public
 * flag or a non-500 status. A bare `Error` would reach the admin as
 * "Something went wrong", which is the bug this hook exists to fix.
 */
export const blockDeleteWhenSponsored: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const { docs, totalDocs } = await req.payload.find({
    collection: "sponsorships",
    where: { gesture: { equals: id } },
    limit: MAX_NAMED,
    depth: 0,
    overrideAccess: true,
    // Shares the caller's transaction. Without it the lookup runs outside
    // the delete's transaction and can miss rows written in the same request.
    req,
  });

  if (totalDocs === 0) {
    return;
  }

  const named = docs.map(describeSponsorship).join("; ");
  const unnamed = totalDocs - docs.length;
  const andMore = unnamed > 0 ? `; and ${unnamed} more` : "";
  const count =
    totalDocs === 1
      ? "1 sponsorship references"
      : `${totalDocs} sponsorships reference`;

  throw new APIError(
    `Cannot delete this gesture: ${count} it (${named}${andMore}). Cancel or move those sponsorships to another gesture first.`,
    BAD_REQUEST,
    undefined,
    true
  );
};
