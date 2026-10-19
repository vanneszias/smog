import { DISPLAY_NAME_MAX } from "@smog/config/constants";
import { z } from "zod";

/** A positive even size of at least 2 (H.264 needs even sizes; ruling 5). */
const evenSize = z
  .number()
  .int()
  .min(2)
  .refine((value) => value % 2 === 0, "must be even");

/**
 * The background: the source video (the render and the Player), or a still
 * image, the Player's fallback when no MP4 of the source loads (ruling 8).
 * The render never uses the image.
 */
const backgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("video"), src: z.string().min(1) }),
  z.object({ kind: z.literal("image"), src: z.string().min(1) }),
]);

/**
 * The props of `SponsoredVideo`, the same in the render and the Player
 * (phase 7 ruling 5). The size and duration are the source's own, read by
 * the caller with `readSourceMetadata`. The render server validates them
 * before `selectComposition`, the Player before it mounts; `<Composition>`
 * gets no `schema` prop.
 */
export const sponsoredVideoPropsSchema = z.object({
  background: backgroundSchema,
  /** The sponsor's line under the fixed intro (1..35 characters). */
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX),
  durationInFrames: z.number().int().min(1),
  height: evenSize,
  /** The logo's URL (the render server's local URL, or an object URL). */
  logoUrl: z.string().min(1).nullable(),
  width: evenSize,
});

export type SponsoredVideoBackground = z.infer<typeof backgroundSchema>;

export type SponsoredVideoProps = z.infer<typeof sponsoredVideoPropsSchema>;
