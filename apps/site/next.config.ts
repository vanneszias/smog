import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

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
    ];
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
