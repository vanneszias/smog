/**
 * `@smog/account/schema`: the Zod schemas and limits of the account
 * procedures, shared by the contract, the server and the hooks.
 * Client-safe (no server imports).
 */
import { LOCALES } from "@smog/config/constants";
import {
  gestureIdSchema,
  LIST_DESCRIPTION_MAX,
  LIST_ITEMS_MAX,
  LISTS_MAX,
  listNameSchema,
  SHARE_ROLES,
} from "@smog/lists/schema";
import { roleSchema } from "@smog/rpc/contract";
import { z } from "zod";

/** Favorites per import call (the rest stays on the device for the next one). */
export const IMPORT_FAVORITES_MAX = 1000;
/** Lists per import call: what one account can hold (`LISTS_MAX`). */
export const IMPORT_LISTS_MAX = LISTS_MAX;
/** Gestures per imported list: what one list can hold (`LIST_ITEMS_MAX`). */
export const IMPORT_LIST_ITEMS_MAX = LIST_ITEMS_MAX;

/** A guest list as the import sends it (name and description trimmed). */
export const importListSchema = z.object({
  /** Empty (after trimming) means none. */
  description: z
    .string()
    .trim()
    .max(LIST_DESCRIPTION_MAX)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  /** In list order. */
  gestureIds: z.array(gestureIdSchema).max(IMPORT_LIST_ITEMS_MAX),
  name: listNameSchema,
});

/** The guest's analytics choice (`GuestData.consent`, once decided). */
export const importConsentSchema = z.object({
  analytics: z.boolean(),
  /** Epoch milliseconds. */
  decidedAt: z.number().int().nonnegative(),
});

export const importGuestDataInputSchema = z.object({
  consent: importConsentSchema.optional(),
  /** Oldest first, as the device stores them. */
  favorites: z.array(gestureIdSchema).max(IMPORT_FAVORITES_MAX),
  lists: z.array(importListSchema).max(IMPORT_LISTS_MAX),
});

const count = z.number().int().nonnegative();

/**
 * What became of one guest list: `created`, `merged` into a same-name
 * list, or `notCreated` (the account is at `LISTS_MAX`), which the device
 * keeps. `unplaced` are its published gestures that did not fit
 * (`LIST_ITEMS_MAX`); the device keeps those too.
 */
export const IMPORT_LIST_STATUSES = [
  "created",
  "merged",
  "notCreated",
] as const;

export const importListOutcomeSchema = z.object({
  status: z.enum(IMPORT_LIST_STATUSES),
  unplaced: z.array(z.string()),
});

export const importResultSchema = z.object({
  favoritesAdded: count,
  /** Items appended to created and merged lists. */
  itemsAdded: count,
  /** Items not added because their list reached `LIST_ITEMS_MAX`. */
  itemsOverLimit: count,
  /** One outcome per guest list sent, in the order sent. */
  lists: z.array(importListOutcomeSchema),
  listsCreated: count,
  /** Guest lists appended to a same-name list (case-insensitive, trimmed). */
  listsMerged: count,
  /** Guest lists not created because the account has `LISTS_MAX` lists. */
  listsOverLimit: count,
  /**
   * Distinct gesture ids that are unknown, unpublished or malformed
   * (skipped; the client adds the malformed ones it never sent).
   */
  skippedUnknownGestures: count,
});

export type ImportList = z.input<typeof importListSchema>;
/** What a client sends. */
export type ImportGuestDataInput = z.input<typeof importGuestDataInputSchema>;
/** What the server gets after the contract parsed it (trimmed). */
export type ImportGuestData = z.output<typeof importGuestDataInputSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ImportListOutcome = z.infer<typeof importListOutcomeSchema>;

/** Nothing imported: what `importGuestData` answers when there is nothing to send. */
export const EMPTY_IMPORT_RESULT: ImportResult = {
  favoritesAdded: 0,
  itemsAdded: 0,
  itemsOverLimit: 0,
  lists: [],
  listsCreated: 0,
  listsMerged: 0,
  listsOverLimit: 0,
  skippedUnknownGestures: 0,
};

// Profile (`account.me`, `account.updateProfile`)

/** `user.name`, trimmed. */
export const PROFILE_NAME_MAX = 80;

export const profileNameSchema = z.string().trim().min(1).max(PROFILE_NAME_MAX);

/** An app language (`LOCALES`), or `null` to follow the device or browser. */
export const profileLocaleSchema = z.enum(LOCALES).nullable();

/** Only the fields sent change; an empty object changes nothing. */
export const updateProfileInputSchema = z.object({
  locale: profileLocaleSchema.optional(),
  name: profileNameSchema.optional(),
});

/** How the user can sign in (never a token or a credential id). */
export const signInMethodsSchema = z.object({
  apple: z.boolean(),
  google: z.boolean(),
  /** Registered passkeys. */
  passkeys: z.number().int().nonnegative(),
  /** A credential account with a password. */
  password: z.boolean(),
});

export const meSchema = z.object({
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
  email: z.string(),
  emailVerified: z.boolean(),
  id: z.string(),
  image: z.string().nullable(),
  locale: profileLocaleSchema,
  methods: signInMethodsSchema,
  name: z.string(),
  role: roleSchema,
});

/** What a client sends. */
export type UpdateProfileInput = z.input<typeof updateProfileInputSchema>;
/** What the server gets after the contract parsed it (trimmed). */
export type UpdateProfile = z.output<typeof updateProfileInputSchema>;
export type SignInMethods = z.infer<typeof signInMethodsSchema>;
export type Me = z.infer<typeof meSchema>;

// Consent (`account.consent.get`, `account.consent.set`)

/**
 * `consent_event.purpose` and `.source`: the values of `@smog/db`
 * `CONSENT_PURPOSES` / `CONSENT_SOURCES` (the server writes and reads those
 * columns, so a mismatch fails its type-check).
 */
export const CONSENT_PURPOSES = ["analytics", "marketing"] as const;
export const CONSENT_SOURCES = ["web", "mobile", "import"] as const;
/** Where a signed-in decision is made (`import` is the guest import's). */
export const CONSENT_SET_SOURCES = ["web", "mobile"] as const;
export type ConsentSetSource = (typeof CONSENT_SET_SOURCES)[number];

export const setConsentInputSchema = z.object({
  analytics: z.boolean(),
  /** Default `web`; `useConsent` sends `mobile` in the app. */
  source: z.enum(CONSENT_SET_SOURCES).default("web"),
});

/** The current analytics decision: the newest `consent_event` row. */
export const consentStateSchema = z.object({
  /** `null` while the user has not decided. */
  analytics: z.boolean().nullable(),
  /** Epoch milliseconds, `null` while undecided. */
  decidedAt: z.number().int().nullable(),
  /** The policy version the decision refers to, `null` while undecided. */
  policyVersion: z.string().nullable(),
});

export type SetConsentInput = z.input<typeof setConsentInputSchema>;
export type SetConsent = z.output<typeof setConsentInputSchema>;
export type ConsentState = z.infer<typeof consentStateSchema>;

export const UNDECIDED_CONSENT: ConsentState = {
  analytics: null,
  decidedAt: null,
  policyVersion: null,
};

// Export (`account.export`: GDPR access and portability)

export const ACCOUNT_EXPORT_VERSION = 2;

/** Dates in the export are ISO 8601 (UTC): the file is meant to be read. */
const isoDate = z.iso.datetime();

const exportGestureSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const accountExportSchema = z.object({
  /** The consent log, oldest first. */
  consent: z.array(
    z.object({
      createdAt: isoDate,
      granted: z.boolean(),
      policyVersion: z.string(),
      purpose: z.enum(CONSENT_PURPOSES),
      source: z.enum(CONSENT_SOURCES),
    })
  ),
  exportedAt: isoDate,
  exportVersion: z.literal(ACCOUNT_EXPORT_VERSION),
  /** Newest first. */
  favorites: z.array(
    z.object({ addedAt: isoDate, gesture: exportGestureSchema })
  ),
  /** Oldest first, with the items in list order and the active share links. */
  lists: z.array(
    z.object({
      createdAt: isoDate,
      description: z.string().nullable(),
      id: z.string(),
      items: z.array(
        z.object({
          addedAt: isoDate,
          gesture: exportGestureSchema,
          position: z.number().int().nonnegative(),
        })
      ),
      name: z.string(),
      shareLinks: z.array(
        z.object({
          createdAt: isoDate,
          role: z.enum(SHARE_ROLES),
          url: z.string(),
        })
      ),
      updatedAt: isoDate,
    })
  ),
  profile: z.object({
    createdAt: isoDate,
    email: z.string(),
    emailVerified: z.boolean(),
    id: z.string(),
    image: z.string().nullable(),
    locale: profileLocaleSchema,
    name: z.string(),
    role: roleSchema,
  }),
  /** Provider names, passkey names and dates only: never a token, hash or key. */
  signInMethods: z.object({
    passkeys: z.array(
      z.object({ createdAt: isoDate.nullable(), name: z.string().nullable() })
    ),
    /** Better Auth provider ids: `credential` (password), `google`, `apple`. */
    providers: z.array(z.object({ linkedAt: isoDate, provider: z.string() })),
  }),
  /**
   * Checkouts whose sponsor email is the user's verified email, oldest
   * first: the contact and invoice details, and each sponsorship's status
   * and dates. No payment ids or amounts.
   */
  sponsorships: z.array(
    z.object({
      contact: z.object({
        company: z.string().nullable(),
        email: z.string(),
        locale: z.enum(LOCALES),
        name: z.string(),
      }),
      createdAt: isoDate,
      invoice: z
        .object({ email: z.string(), name: z.string(), vatNumber: z.string() })
        .nullable(),
      items: z.array(
        z.object({
          createdAt: isoDate,
          displayName: z.string(),
          endsAt: isoDate.nullable(),
          gesture: exportGestureSchema,
          hasLogo: z.boolean(),
          startsAt: isoDate.nullable(),
          status: z.string(),
          updatedAt: isoDate,
        })
      ),
    })
  ),
});

export type AccountExport = z.infer<typeof accountExportSchema>;

// Deletion (`account.delete`)

/** What the user types to confirm (the same word in every language). */
export const DELETE_CONFIRMATION = "DELETE";

export const deleteAccountInputSchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION),
  /**
   * The current password, when the session is older than Better Auth's
   * `freshAge` (after a recent sign-in none is needed). Better Auth checks
   * its length; this bound only keeps the request small.
   */
  password: z.string().min(1).max(1024).optional(),
});

export const deleteAccountResultSchema = z.object({
  deleted: z.literal(true),
});

export type DeleteAccountInput = z.input<typeof deleteAccountInputSchema>;
export type DeleteAccountResult = z.infer<typeof deleteAccountResultSchema>;
