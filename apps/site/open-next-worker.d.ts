/**
 * Types for `#open-next-worker` (see `package.json`'s `imports` map), the
 * subpath `worker.ts` imports instead of `./.open-next/worker.js` directly.
 *
 * `@opennextjs/cloudflare` writes `.open-next/worker.js` only when
 * `opennextjs-cloudflare build` has run, and `tsconfig.json` excludes
 * `.open-next` so a stale build never leaks into `check-types` — but
 * `exclude` only governs which files seed the initial file list; a file an
 * included file explicitly imports is still added to the program and still
 * gets its own diagnostics reported, `exclude` or not.
 *
 * That distinction is why this is a package subpath import rather than a
 * plain relative one. Node's (and TypeScript's, and esbuild's) `imports`
 * field lets one written specifier — `#open-next-worker` — resolve
 * differently per consumer: `esbuild` (wrangler's bundler, at deploy or
 * `wrangler dev` time) has no `types` condition, so it always takes the
 * `default` branch and bundles the real, built `.open-next/worker.js`.
 * TypeScript, resolving the same specifier for `check-types`, *does* apply
 * conditions and picks `types` unconditionally — this file — regardless of
 * whether `.open-next/worker.js` exists on disk. A plain relative import, by
 * contrast, always resolves to whatever is actually at that path once it
 * exists, real file or not (confirmed directly: TypeScript prefers a real,
 * same-named file over any ambient declaration the moment one exists), which
 * is what let a build's real `.open-next/worker.js` reach `check-types`
 * before this file was a subpath import.
 *
 * That reachability mattered because `.open-next/worker.js` pulls in its own
 * dynamic `import("./server-functions/.../handler.mjs")` — Next's ~9,000-line
 * bundled server, containing a minified private-class-field pattern this
 * TypeScript version's parser cannot handle (`TS1111`, "Private field '#d'
 * must be declared in an enclosing class") — and `@ts-expect-error` on an
 * import only suppresses the diagnostic on *that* line, not the requirement
 * to still parse whatever it resolves to for the file three imports away
 * (OpenNext's own generated `worker.js` already carries `@ts-expect-error`
 * on this exact import, and it did not help). With
 * `#open-next-worker` in place of the relative path, TypeScript's program
 * never reaches `.open-next/worker.js` — or `handler.mjs` — at all, in
 * either state, so the crash cannot recur; `bun -F site check-types` was
 * re-verified clean both with `.open-next` absent and immediately after a
 * real `CLOUDFLARE_ENV=staging PAYLOAD_SECRET=local-build-only bun run
 * build:app`.
 *
 * Kept intentionally thin: OpenNext's actual template
 * (`cli/templates/worker.js`) exports `fetch` plus three Durable Object
 * classes this application never re-exports (see `worker.ts`'s doc comment),
 * so only `fetch` is declared here.
 */
declare const handler: {
  fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<Response>;
};

export default handler;
