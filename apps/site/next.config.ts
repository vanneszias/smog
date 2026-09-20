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
