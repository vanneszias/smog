import {
  RECENT_GESTURES_MAX,
  RECENT_SEARCHES_MAX,
} from "@smog/config/constants";
import { localeCodeSchema } from "@smog/config/locale";
import { z } from "zod";

/** 2 added `preferences.importDismissedFor` (`MIGRATIONS[1]`). */
export const GUEST_DATA_VERSION = 2;

const THEMES = ["system", "light", "dark"] as const;

export const localListSchema = z.object({
  createdAt: z.number().int(),
  description: z.string().optional(),
  gestureIds: z.array(z.string()),
  id: z.string().min(1),
  name: z.string(),
  updatedAt: z.number().int(),
});

export const guestDataSchema = z.object({
  consent: z.object({
    /** `null` while the guest has not decided. */
    analytics: z.boolean().nullable(),
    decidedAt: z.number().int().optional(),
    /**
     * Set when this is a copy of a signed-in account's decision (its user
     * id), not a guest's own choice. Only a guest's own choice is ever
     * sent to an account (a shared device must never pass one user's
     * consent to another).
     */
    mirroredFrom: z.string().min(1).optional(),
  }),
  favorites: z.array(z.string()),
  lists: z.array(localListSchema),
  preferences: z.object({
    /**
     * When the web app banner (spec §9, inventory L-16) was dismissed on
     * this device. Optional and additive, so stored v2 data still parses.
     */
    appBannerDismissedAt: z.number().int().optional(),
    /**
     * The viewer hid the gesture name over the video (phase 10b). Optional
     * and additive, so stored v2 data still parses; absent is shown.
     */
    hideGestureName: z.boolean().optional(),
    /**
     * Signed-in user ids that dismissed the guest import prompt on this
     * device, oldest first (at most `IMPORT_DISMISSED_MAX`).
     */
    importDismissedFor: z.array(z.string()),
    /** `null` follows the device or browser language. */
    locale: localeCodeSchema.nullable(),
    /**
     * Gestures this device opened lately, newest first (at most
     * `RECENT_GESTURES_MAX`): Home's "continue where you left off". Like
     * recent searches they never leave the device. Optional and additive,
     * so stored v2 data still parses.
     */
    recentGestureIds: z
      .array(z.string().min(1))
      .max(RECENT_GESTURES_MAX)
      .optional(),
    theme: z.enum(THEMES),
  }),
  recentSearches: z.array(z.string()).max(RECENT_SEARCHES_MAX),
  version: z.literal(GUEST_DATA_VERSION),
});

export type LocalList = z.infer<typeof localListSchema>;
export type GuestData = z.infer<typeof guestDataSchema>;
export type GuestPart = Exclude<keyof GuestData, "version">;

export const GUEST_PARTS = [
  "favorites",
  "lists",
  "recentSearches",
  "consent",
  "preferences",
] as const satisfies readonly GuestPart[];

/** A fresh default value on every call, so callers can never share state. */
export function defaultGuestData(): GuestData {
  return {
    consent: { analytics: null },
    favorites: [],
    lists: [],
    preferences: { importDismissedFor: [], locale: null, theme: "system" },
    recentSearches: [],
    version: GUEST_DATA_VERSION,
  };
}
