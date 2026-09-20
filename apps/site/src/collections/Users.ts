import type { CollectionConfig } from "payload";
import { isAdmin, isAdminField, isAdminOrSelf } from "@/access";
import { googleStrategy } from "@/auth/googleStrategy";
import { cascadeListsOnUserDelete } from "@/hooks/cascadeListsOnUserDelete";
import { enforcePasswordPolicy } from "@/hooks/enforcePasswordPolicy";

/** `lockTime` is milliseconds — see the note on `auth` below. */
const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * How many failed sign-ins lock the account.
 *
 * ## Why this is the brute-force control, and the hash is not
 *
 * Payload 3.89.0 hashes passwords with **PBKDF2-HMAC-SHA256 at 25,000
 * iterations** — the literal `25000` in `pbkdf2Promisified`
 * (`payload/dist/auth/strategies/local/generatePasswordSaltHash.js`). OWASP's
 * current guidance for that algorithm is **600,000**, so every password this
 * app stores is protected by roughly 1/24th of the work factor it should be.
 *
 * Payload 3.90.x raises the constant to exactly 600,000, and **that is the
 * release this project cannot run**: workerd caps PBKDF2 at 100,000
 * iterations, so the fixed version cannot hash a password on Cloudflare at
 * all. The iteration count is not exposed as configuration — it is a literal
 * in the dependency — so there is no third option. This is why `payload` and
 * every `@payloadcms/*` package are pinned to `3.89.0`, and it is a
 * deliberate, recorded trade, not an oversight. Do not "fix" it by
 * upgrading, and do not replace it with a bespoke KDF; either is worse than
 * the problem. Revisit only when Payload makes iterations configurable or
 * workerd raises its cap.
 *
 * What follows from that: **resistance to online guessing has to come from
 * lockout rather than from the cost of a single guess.** Hence the two
 * settings below, the password floor in `hooks/enforcePasswordPolicy`, and
 * the stage's preference for Google sign-in, which gives us no password to
 * hash in the first place. Full write-up in
 * `docs/superpowers/specs/2026-09-19-stage-0-findings.md`.
 *
 * ## Why these are written out when 3.89.0 already defaults to them
 *
 * `addDefaultsToAuthConfig` (`payload/dist/collections/config/defaults.js`)
 * applies `maxLoginAttempts: 5` and `lockTime: 600000` even to a bare
 * `auth: true`, so setting them changes no behaviour today — verified
 * against a real database. They are spelled out anyway because the whole
 * brute-force story rests on them: an upstream default is something a
 * dependency bump can move silently, and a future edit that turns `auth`
 * into an object of its own is one forgotten key away from
 * `maxLoginAttempts: 0`. `Users.test.ts` pins both values and
 * `Users.lockout.int.test.ts` pins the behaviour.
 */
const MAX_LOGIN_ATTEMPTS = 5;

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    // Without this, Payload lets ANY authenticated user load /admin. Public
    // registration is on, so that would be one signup away from the whole
    // admin panel.
    hidden: ({ user }) => user?.role !== "admin",
  },
  auth: {
    /*
     * Google sign-in, as a first-class strategy rather than as something
     * bolted onto the login endpoint.
     *
     * Two things about the list are worth knowing before touching it.
     * **Custom strategies run before Payload's own** — `payload.init` builds
     * `authStrategies` from the collections first and appends `local-jwt`
     * last (`payload/dist/index.js`) — so everything here is on the path of
     * every authenticated request, including the admin panel's. And
     * `executeAuthStrategies` **stops at the first strategy that returns a
     * user**, so one that answers when it should not shadows password
     * sessions entirely. `auth/googleStrategy.ts` therefore answers only for
     * tokens carrying its own provider claim and returns `{ user: null }`
     * for everything else; `Users.oauth.int.test.ts` pins that an ordinary
     * password session is unaffected by its presence.
     */
    strategies: [googleStrategy],
    // Read `MAX_LOGIN_ATTEMPTS` above before changing either of these: they
    // are the brute-force control, because the password hash is not one.
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
    // Milliseconds. Confirmed at the call site rather than assumed:
    // `incrementLoginAttempts` computes `new Date(Date.now() + lockTime)`
    // (`payload/dist/auth/strategies/local/incrementLoginAttempts.js`), and
    // `payload/dist/auth/types.d.ts:210` documents the unit.
    lockTime: TEN_MINUTES_MS,
    cookies: {
      /*
       * Payload's default is `secure: false`, not merely unset —
       * `addDefaultsToAuthConfig` writes `{ sameSite: 'Lax', secure: false }`
       * over whatever is missing (`collections/config/defaults.js:132`), and
       * `generatePayloadCookie` passes it straight through
       * (`auth/cookies.js`). So the session cookie ships without the `Secure`
       * attribute unless it is asked for here, and a browser will then send
       * it over plain HTTP to this host — the one request an attacker on the
       * network gets to read.
       *
       * Setting it does not break local work: `http://localhost` is a
       * trustworthy origin, and Chromium has accepted `Secure` cookies from
       * it since Chrome 89. `tests/e2e/auth.spec.ts` and the admin specs both
       * sign in over `http://localhost:3003`, so that claim is tested rather
       * than asserted.
       *
       * `sameSite` is left to the default `Lax`, which is what keeps the
       * cookie off a cross-site POST — half of why `/auth/sign-out` is safe.
       * The other half, and the login-CSRF case `Lax` does not cover, is the
       * `Origin` check in `endpoints/auth.ts`.
       */
      secure: true,
    },
  },
  // A list without an owner has no meaning and no access filter can reach
  // it, so the spec's referential-integrity table rules cascade. See
  // `hooks/cascadeListsOnUserDelete`.
  hooks: {
    beforeDelete: [cascadeListsOnUserDelete],
    // Payload checks that a password is *present*, not that it is any good:
    // its only length rule is a hard-coded `minLength = 3`. This is the
    // floor. See `hooks/enforcePasswordPolicy` for why it is a collection
    // hook rather than a field `validate`, and for the one path it cannot
    // reach.
    beforeValidate: [enforcePasswordPolicy],
  },
  access: {
    read: isAdminOrSelf,
    // Public registration is intentional; Stage 4 revisits it when social
    // login lands. The `role` field below is what keeps that from being an
    // admin signup form.
    create: () => true,
    update: isAdminOrSelf,
    delete: isAdmin,
    // Payload's defaultUnlockAccess is any authenticated user of the admin
    // collection, so without this any account could clear any victim's login
    // lockout on demand and brute-force protection would be decorative.
    unlock: isAdmin,
    // `access.admin` decides who may load /admin at all. Its signature is
    // boolean-only — unlike `Access`, it has no `Where` form — so it takes the
    // field-level predicate rather than `isAdmin`. Without it Payload lets any
    // authenticated user in, which with public registration is one signup away
    // from the whole admin panel.
    admin: isAdminField,
  },
  fields: [
    // Email added by default
    // Add more fields as needed
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "user",
      options: [
        { label: "User", value: "user" },
        { label: "Admin", value: "admin" },
      ],
      access: {
        // BOTH of these are load-bearing, and `create` is the one that is
        // easy to miss.
        //
        // `update`: isAdminOrSelf already grants a user document-level update
        // on their own record, so without this any user could PATCH their own
        // role to "admin".
        //
        // `create`: collection-level create is public by design. Without a
        // field-level create guard, an anonymous POST to /api/users carrying
        // `role: "admin"` produces an admin account — full takeover in one
        // unauthenticated request. A field guard on `update` alone does not
        // cover the create path.
        create: isAdminField,
        update: isAdminField,
      },
      index: true,
    },
    {
      /*
       * The identities at external providers that may sign in to this
       * account.
       *
       * **Stored rather than matching on email alone**, because the email on
       * a Google account can change and `sub` cannot: Google documents it as
       * stable for the life of the account and never reused. Matching only
       * on email would mean somebody who changes their Google address to one
       * we already know gets handed that account.
       *
       * **An array, and `provider` is stored beside `subject`**, because the
       * plan requires Apple to slot in later. A subject is only unique
       * within its provider.
       */
      name: "oauthAccounts",
      type: "array",
      access: {
        /*
         * Exactly the guard on `role` above, and for a sharper reason.
         * `isAdminOrSelf` gives a signed-in visitor document-level update on
         * their own record, so without a field guard they could write
         * *somebody else's* Google subject onto their own account — and the
         * next time that person signed in with Google, they would land in
         * the attacker's account with the attacker reading everything they
         * did there. `endpoints/oauth.ts` writes this field with
         * `overrideAccess: true`, which is the only path that may.
         */
        create: isAdminField,
        update: isAdminField,
      },
      admin: {
        description:
          "Linked social sign-ins. Written by the OAuth callback; not editable here.",
      },
      fields: [
        { name: "provider", type: "text", required: true, index: true },
        { name: "subject", type: "text", required: true, index: true },
      ],
    },
    {
      name: "favorites",
      type: "relationship",
      relationTo: "gestures",
      hasMany: true,
      hooks: {
        // Payload's hasMany relationship stores whatever array it is given,
        // duplicates included — verified against a real database, where
        // [id, id] round-tripped as [3, 3]. The spec originally claimed
        // dropping the join table made one-favorite-per-pair structural; it
        // did not, so it is enforced here.
        beforeChange: [
          ({ value }) => {
            if (!Array.isArray(value)) {
              return value;
            }

            const ids = value.map((entry) =>
              typeof entry === "object" && entry !== null && "id" in entry
                ? (entry as { id: number | string }).id
                : entry
            );

            return [...new Set(ids)];
          },
        ],
      },
      admin: {
        description: "Gestures this user has favorited.",
      },
    },
  ],
  versions: false,
};
