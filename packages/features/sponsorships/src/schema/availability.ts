/**
 * The public reads of the wizard and the gesture CTA: which gestures can
 * be sponsored (`sponsorships.availability`, S-02, S-26, L-17) and what a
 * selection costs (`sponsorships.quote`). Dates are epoch milliseconds.
 */
import { z } from "zod";
import { checkoutGestureIdsSchema } from "./wizard";

/** At most 100 ids per read (one `json_each` parameter). */
export const AVAILABILITY_IDS_MAX = 100;

/**
 * - `available`: no blocking sponsorship; it can be sponsored.
 * - `pending`: a sponsorship is being paid, rendered, reviewed or edited
 *   (every blocking status but `live`/`expiring`, bug 17).
 * - `sponsored`: `live` or `expiring`, with the sponsor's name and end.
 * - `unavailable`: unknown or unpublished (bug 39).
 */
export const AVAILABILITY_STATES = [
  "available",
  "pending",
  "sponsored",
  "unavailable",
] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export const availabilityInputSchema = z.object({
  gestureIds: z.array(z.uuid()).min(1).max(AVAILABILITY_IDS_MAX),
});

export const availabilityItemSchema = z.object({
  /** Only for `sponsored`. */
  endsAt: z.number().int().optional(),
  gestureId: z.string(),
  /** The display name, only for `sponsored` (S-26). */
  sponsorName: z.string().optional(),
  state: z.enum(AVAILABILITY_STATES),
});
export type AvailabilityItem = z.infer<typeof availabilityItemSchema>;

export const availabilitySchema = z.object({
  /** `false` without `MOLLIE_API_KEY`: the wizard says sponsoring is paused. */
  checkoutEnabled: z.boolean(),
  /** One per distinct id asked, in the order asked. */
  items: z.array(availabilityItemSchema),
});
export type Availability = z.infer<typeof availabilitySchema>;

export const quoteInputSchema = z.object({
  gestureIds: checkoutGestureIdsSchema,
  logo: z.boolean(),
});

export const quoteSchema = z.object({
  currency: z.literal("EUR"),
  /** One per gesture asked, priced by `priceSponsorship`. */
  items: z.array(
    z.object({
      amountCents: z.number().int(),
      gestureId: z.string(),
      includesLogo: z.boolean(),
    })
  ),
  totalCents: z.number().int(),
  /** The gestures asked that are not `available` (remove them to check out). */
  unavailable: z.array(z.string()),
});
export type Quote = z.infer<typeof quoteSchema>;
