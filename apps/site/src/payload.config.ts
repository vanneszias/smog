import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CloudflareContext,
  getCloudflareContext,
} from "@opennextjs/cloudflare";
import { sqliteD1Adapter } from "@payloadcms/db-d1-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { r2Storage } from "@payloadcms/storage-r2";
import type { PayloadLogger } from "payload";
import { buildConfig } from "payload";
import type { GetPlatformProxyOptions } from "wrangler";
import { Categories } from "./collections/Categories";
import { Gestures } from "./collections/Gestures";
import { Media } from "./collections/Media";
import { Users } from "./collections/Users";
import { requireBinding, requireEnv } from "./lib/env";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const realpath = (value: string) =>
  fs.existsSync(value) ? fs.realpathSync(value) : undefined;

const isCLI = process.argv.some((value) =>
  realpath(value)?.endsWith(path.join("payload", "bin.js"))
);
const isProduction = process.env.NODE_ENV === "production";

/**
 * True while `next build` is collecting route configuration.
 *
 * PAYLOAD_SECRET and the D1/R2 bindings are *runtime* inputs: the secret comes
 * from Cloudflare's secret store and the bindings from the Worker environment,
 * neither of which exists during a build. Demanding them here broke the root
 * `bun run build` and `release:check` for the whole monorepo, and it would
 * break any real CI build too — the earlier build only passed because a
 * throwaway secret happened to be exported by hand.
 *
 * Nothing security-relevant happens during a build: no session is signed, no
 * query is issued. The strict checks still run in the Worker, where a missing
 * secret or binding is a genuine fault and fails loudly on the first request.
 */
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

/** Placeholder used only while collecting route config; never reaches a request. */
const BUILD_PHASE_SECRET = "build-phase-placeholder-not-used-at-runtime";

const createLog =
  (level: string, fn: typeof console.log) =>
  (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === "string") {
      fn(JSON.stringify({ level, msg: objOrMsg }));
    } else {
      fn(
        JSON.stringify({
          level,
          ...objOrMsg,
          msg: msg ?? (objOrMsg as { msg?: string }).msg,
        })
      );
    }
  };

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || "info",
  trace: createLog("trace", console.debug),
  debug: createLog("debug", console.debug),
  info: createLog("info", console.log),
  warn: createLog("warn", console.warn),
  error: createLog("error", console.error),
  fatal: createLog("fatal", console.error),
  silent: () => {
    // Cloudflare Workers logging has no silent sink; this is an intentional no-op.
  },
} as unknown as PayloadLogger;

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true });

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Categories, Gestures],
  editor: lexicalEditor(),
  localization: {
    locales: [
      { label: "Nederlands", code: "nl" },
      { label: "English", code: "en" },
      { label: "Français", code: "fr" },
    ],
    defaultLocale: "nl",
    fallback: true,
  },
  secret: isNextBuild
    ? (process.env.PAYLOAD_SECRET ?? BUILD_PHASE_SECRET)
    : requireEnv("PAYLOAD_SECRET"),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteD1Adapter({
    binding: isNextBuild
      ? (cloudflare.env.D1 as D1Database)
      : requireBinding(cloudflare.env.D1, "D1"),
  }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: isNextBuild
        ? (cloudflare.env.R2 as R2Bucket)
        : requireBinding(cloudflare.env.R2, "R2"),
      collections: { media: true },
    }),
  ],
});

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(
    /* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`
  ).then(({ getPlatformProxy }) =>
    getPlatformProxy({
      environment: process.env.CLOUDFLARE_ENV,
      remoteBindings: isProduction,
    } satisfies GetPlatformProxyOptions)
  );
}
