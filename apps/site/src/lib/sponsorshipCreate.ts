import type { Payload, RequiredDataFromCollectionSlug } from "payload";
import { SPONSORSHIP_DEFAULTS } from "@/collections/Sponsorships";
import type { Sponsorship } from "@/payload-types";

/**
 * The generated create type, with the two fields that have defaults made
 * optional.
 *
 * Payload generates `status` and `durationYears` as required on create
 * because they are `required: true` on the field, and does not account for
 * `defaultValue` — so the call the default exists to serve does not
 * typecheck. The spec records this and asks for one central fix rather than
 * a cast at each call site, which is what this is.
 *
 * `Omit` plus `Partial` rather than a bare `as`: a cast would also silence a
 * genuinely missing `sponsorName`, and every field except these two is
 * still checked. The test file pins that with a `@ts-expect-error`, which is
 * the only thing that makes a widening of this type to `any` visible.
 *
 * The plan offered a second formulation —
 * `Parameters<Payload["create"]>[0] extends { data: infer D } ? D : never` —
 * and it does not work. `payload.create` is generic over the collection
 * slug, so `Parameters<...>[0]` resolves the parameter to its constraint and
 * yields a `data` type for *no particular collection*:
 * `A extends { sponsorName: string }` is false, and the resulting type is
 * not assignable to `create`'s own parameter. `RequiredDataFromCollectionSlug`
 * is the named export Payload provides for exactly this, and it is what is
 * used below.
 */
export type NewSponsorship = Omit<
  RequiredDataFromCollectionSlug<"sponsorships">,
  "durationYears" | "status"
> &
  Partial<Pick<Sponsorship, "durationYears" | "status">>;

/**
 * Creates a sponsorship, letting the caller omit the two fields that have
 * defaults.
 *
 * The defaults are spread in from `SPONSORSHIP_DEFAULTS` — the same object
 * the collection's `defaultValue`s are built from — rather than asserted
 * past the type with a cast. A caller who names either field wins, because
 * `...data` comes second; a caller who passes one as an explicit `undefined`
 * gets the field's `defaultValue` from Payload, which is the same value.
 */
export function createSponsorship(
  payload: Payload,
  data: NewSponsorship
): Promise<Sponsorship> {
  return payload.create({
    collection: "sponsorships",
    data: { ...SPONSORSHIP_DEFAULTS, ...data },
  });
}
