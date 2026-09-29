import { LOCALES, RECENT_SEARCHES_MAX } from "@smog/config/constants";
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
  }),
  favorites: z.array(z.string()),
  lists: z.array(localListSchema),
  preferences: z.object({
    /**
     * Signed-in user ids that dismissed the guest import prompt on this
     * device, oldest first (at most `IMPORT_DISMISSED_MAX`).
     */
    importDismissedFor: z.array(z.string()),
    /** `null` follows the device or browser language. */
    locale: z.enum(LOCALES).nullable(),
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
