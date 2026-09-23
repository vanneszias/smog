import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./src/lib/legacyRedirects";

const nextConfig: NextConfig = {
  // Next 16 writes an AGENTS.md and a CLAUDE.md into this directory on boot.
  // Neither is wanted here: the repository's instructions live in the root
  // AGENTS.md, and a generated file in `apps/site/` would be a
  // directory-scoped override that silently outranks it for everything in
  // this app — instructions nobody wrote, aimed at the agents working on the
  // codebase. They are untracked rather than gitignored, so the realistic
  // outcome is someone eventually commits them by accident. Opting out at the
  // source beats ignoring the symptom.
  agentRules: false,

  /**
   * The two crawler files live on Payload's REST entry, not in `app/`.
   *
   * A `sitemap.ts` that imports Payload is its own bundle entry and measured
   * +523.65 KiB gzipped against this commit; the same generator as a Payload
   * endpoint measured +5.06 KiB, because `app/(payload)/api/[...slug]/route.ts`
   * already carries that graph. See `src/endpoints/crawler.ts`.
   *
   * A rewrite, unlike a redirect, keeps the conventional URL: a crawler that
   * probes `/robots.txt` gets the file at `/robots.txt`, with no hop and no
   * `/api/` path in anyone's index. Rewrites are entries in the routes
   * manifest, so this costs no bundled code at all.
   */
  async rewrites() {
    return [
      { destination: "/api/robots.txt", source: "/robots.txt" },
      { destination: "/api/sitemap.xml", source: "/sitemap.xml" },
      /*
       * The auth endpoints, for the same bundle reason and by the same
       * mechanism. `src/endpoints/auth.ts` hangs three handlers off Payload's
       * existing REST entry, which reaches them at `/api/auth/*`; these three
       * lines are what let a `<form action="/auth/sign-in">` find them.
       *
       * Locale-free on purpose. The forms carry the locale in their body, so
       * there is one path per action rather than one per action per locale,
       * and the endpoint clamps whatever arrives to a known locale before it
       * builds a `Location`. Six more rewrites would be six more ways for the
       * set to drift when a fourth locale is added.
       *
       * Returning an array puts these in Next's `afterFiles` phase: checked
       * after real files and pages, before dynamic routes. Nothing in `app/`
       * claims `/auth/*`, so they match — and if something ever does, the
       * file wins and `tests/e2e/auth.spec.ts` fails rather than the sign-in
       * form quietly posting to a page.
       */
      { destination: "/api/auth/sign-in", source: "/auth/sign-in" },
      { destination: "/api/auth/sign-out", source: "/auth/sign-out" },
      { destination: "/api/auth/sign-up", source: "/auth/sign-up" },
      /*
       * Google sign-in. The callback path is the one registered with the
       * provider as a redirect URI, so it is a URL a third party depends on
       * — `endpoints/oauth.ts` derives it from `req.origin` and these two
       * lines are what make that derivation land on the handler.
       */
      { destination: "/api/auth/google", source: "/auth/google" },
      {
        destination: "/api/auth/google/callback",
        source: "/auth/google/callback",
      },
      /*
       * The signed-in favourite write. Locale-free like the auth three, and
       * for a stronger reason: this one is called by `fetch` from a client
       * component rather than by a form, so the path is a constant in
       * `lib/accountFavorites.ts` and there is nothing locale-shaped about
       * it. `tests/e2e/account-favorites.spec.ts` fetches it directly, which
       * is the only place a deleted rewrite shows up as anything but a
       * silently unsaved heart.
       */
      {
        destination: "/api/account/favorites",
        source: "/account/favorites",
      },
      /*
       * The guest-to-account favourites merge, posted once by
       * `lib/mergeGuestState.ts` on the first signed-in page a browser with
       * a leftover guest list opens. A sibling of `/account/favorites`
       * rather than a child of it, for the reason the confirm-email rewrite
       * below gives: two overlapping patterns leave Payload's endpoint
       * matcher to pick, and the wrong pick here would answer "merged"
       * without merging.
       */
      {
        destination: "/api/account/merge-favorites",
        source: "/account/merge-favorites",
      },
      /*
       * The account page's four writes. Locale-free like everything above —
       * the forms carry the locale in their body — and rewrites rather than
       * route handlers for the same bundle reason.
       *
       * `/account/confirm-email` is a sibling of `/account/email` rather
       * than a child of it on purpose: Payload's endpoint matcher would have
       * to decide between two overlapping patterns, and a nested path that
       * resolved to the wrong handler would answer "your address has
       * changed" without changing it.
       */
      { destination: "/api/account/password", source: "/account/password" },
      { destination: "/api/account/email", source: "/account/email" },
      {
        destination: "/api/account/confirm-email",
        source: "/account/confirm-email",
      },
      { destination: "/api/account/delete", source: "/account/delete" },
      /*
       * The owner's six list writes. Locale-free like everything above — the
       * forms carry the locale in their body — and flat siblings rather than
       * nested paths, so Payload's endpoint matcher never has to choose
       * between two patterns that both fit.
       *
       * Note that `/account/lists/*` here and the pages at
       * `/{locale}/account/lists` are different URL spaces: these are the
       * form targets and carry no locale prefix, so nothing in `app/` claims
       * them. `tests/e2e/account-lists.spec.ts` drives the real forms, which
       * is the only layer where a deleted line here shows up as anything but
       * a button that silently does nothing.
       */
      {
        destination: "/api/account/lists/create",
        source: "/account/lists/create",
      },
      {
        destination: "/api/account/lists/rename",
        source: "/account/lists/rename",
      },
      {
        destination: "/api/account/lists/delete",
        source: "/account/lists/delete",
      },
      { destination: "/api/account/lists/add", source: "/account/lists/add" },
      {
        destination: "/api/account/lists/remove",
        source: "/account/lists/remove",
      },
      {
        destination: "/api/account/lists/share",
        source: "/account/lists/share",
      },
      /*
       * The sponsor wizard's three writes. Locale-free like everything above
       * — the forms carry the locale in their body — and flat siblings for
       * the reason `/account/confirm-email` gives: overlapping patterns leave
       * Payload's endpoint matcher to choose, and the wrong choice here would
       * answer "paid" without charging anybody.
       *
       * Nothing in `app/` claims `/sponsor/start`, `/sponsor/details` or
       * `/sponsor/checkout`: the wizard's *pages* are locale-prefixed
       * (`/{locale}/sponsor/...`), so the two URL spaces do not overlap.
       */
      { destination: "/api/sponsor/start", source: "/sponsor/start" },
      { destination: "/api/sponsor/details", source: "/sponsor/details" },
      { destination: "/api/sponsor/checkout", source: "/sponsor/checkout" },
      /*
       * The sponsor's one write after paying. Locale-free like its three
       * siblings, and the token rides in the body rather than the path: the
       * page it posts from carries the token in *its* query string because a
       * capability URL has nowhere else to put it, but a form post does, and
       * a `Location` this endpoint builds should not have to echo a
       * credential it is about to destroy.
       */
      { destination: "/api/sponsor/re-edit", source: "/sponsor/re-edit" },
      /*
       * Mollie's payment webhook. The only rewrite here whose source URL a
       * third party holds: `lib/mollie.ts` sends it to Mollie as
       * `webhookUrl` when a payment is created, and Mollie posts back to
       * whatever it was given — for weeks, on retries, for payments opened
       * long before any deploy. So this line is not a convenience, it is a
       * published address, and deleting it turns every retry into a 404 and
       * every paid sponsorship into one stuck in `pending_payment`.
       *
       * Locale-free like everything above, and for the strongest reason of
       * the set: the caller is a server in Amsterdam that has never heard of
       * this site's locales. `src/endpoints/mollie.int.test.ts` asserts that
       * this entry exists and points at the handler's registered path.
       */
      { destination: "/api/webhooks/mollie", source: "/webhooks/mollie" },
      /*
       * Remotion Lambda's render callback. The second rewrite here whose
       * source URL a third party holds, and it is held for longer than
       * Mollie's: the URL is handed to AWS when a render is submitted and is
       * posted back to minutes later, on retries, for jobs submitted before
       * any deploy. Deleting this line turns every callback into a 404, which
       * AWS retries and then gives up on — and a composed video nobody ever
       * uploads is a sponsor who paid for a render that silently never
       * arrives.
       *
       * Locale-free for the same reason as Mollie's, and the strongest of the
       * set: the caller is a Lambda function that has never heard of this
       * site's locales. `src/endpoints/render.int.test.ts` asserts that this
       * entry exists and that its destination really resolves to the handler.
       */
      { destination: "/api/render/callback", source: "/render/callback" },
      /*
       * The previous website's gesture URL, `/gestures/<id>`, which is in
       * shared links, QR codes and search indexes. Its id may be one the old
       * backend issued, so where it goes takes a lookup, and a lookup that
       * reads Payload belongs on Payload's REST entry for the bundle reason
       * above: `src/endpoints/legacy.ts` answers with a 308 to the gesture's
       * page, or a 307 to the list when nothing matches.
       *
       * Only the unprefixed path: `/{locale}/gestures/<id>` does not match
       * `/gestures/:id`, so the real pages are never rewritten and the
       * redirect they are the target of cannot loop. And nothing in `app/` is a
       * static page at `/gestures/<id>`, while afterFiles rewrites are
       * checked before dynamic routes, so `[locale]` never gets to read
       * `gestures` as a locale. `src/lib/legacyRedirects.test.ts` pins the
       * rewrite and that the locale-prefixed pages pass through untouched.
       */
      {
        destination: "/api/legacy/gestures/:id",
        source: "/gestures/:id",
      },
    ];
  },

  /**
   * The previous website's other unprefixed URLs, each a permanent redirect
   * to its locale-prefixed replacement. See `src/lib/legacyRedirects.ts`.
   *
   * Redirects run before every rewrite and every page, so these sources must
   * never overlap a path the site still serves. Each matches one exact path
   * (`/lists/:token`, one segment below `/lists`), which is what keeps them
   * off the locale-free form targets above: `/account` and `/sponsor` are
   * redirected, `/account/password` and `/sponsor/start` are not.
   */
  async redirects() {
    return LEGACY_REDIRECTS;
  },

  images: {
    localPatterns: [
      {
        pathname: "/api/media/file/**",
      },
    ],
  },
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: ["jose", "pg-cloudflare"],

  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return webpackConfig;
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
