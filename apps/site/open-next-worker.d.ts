/**
 * The ambient shape of OpenNext's generated Worker entry.
 *
 * `worker.ts` imports `./.open-next/worker.js`, which `@opennextjs/cloudflare`
 * writes only when `opennextjs-cloudflare build` has run, and which
 * `tsconfig.json` excludes so a stale build never leaks into `check-types`.
 * Without this declaration the import has nothing to resolve against in a
 * fresh checkout, so `bun -F site check-types` would depend on whether
 * somebody had built first (Review Focus 5). `noTsIgnore` (ultracite) rules
 * out `@ts-ignore` on the import itself, so this shim — narrowed to exactly
 * the one export `worker.ts` uses — is the alternative the task brief asks
 * for instead of a blanket suppression.
 *
 * Kept intentionally thin: OpenNext's actual template
 * (`cli/templates/worker.js`) exports `fetch` plus three Durable Object
 * classes this application never re-exports (see `worker.ts`'s doc comment),
 * so only `fetch` is declared here.
 *
 * The specifier below is a wildcard — a leading `*` followed by
 * `.open-next/worker.js` — rather than the literal relative path `worker.ts`
 * imports: TypeScript rejects `declare module` with a relative-looking name
 * outright (`TS2436`, checked against `typescript@6.0.3` directly).
 *
 * A wildcard ambient module is ordinarily only a fallback for an
 * unresolvable specifier: once a real, same-named file exists (after a
 * build), TypeScript resolves that file instead and this declaration is not
 * consulted. That real file is exactly the problem here — the generated
 * `.open-next/worker.js` pulls in `server-functions/.../handler.mjs`, a
 * bundled bundle whose minified private-class-field pattern is valid
 * JavaScript that this TypeScript version's parser cannot handle, and
 * `check-types` failing on that file — one nobody wrote, nobody can fix, and
 * `tsconfig.json`'s `exclude` does not shield, because `exclude` governs
 * initial file discovery, not files reached through an explicit import — is
 * exactly Review Focus 5. `tsconfig.json`'s `allowJs: false` is what keeps
 * this declaration authoritative instead: with JavaScript sources excluded
 * from the program, TypeScript records that `worker.js` resolves to a real
 * file but cannot use it for typing, and falls back to this ambient
 * declaration whether or not a build has happened — so the parser never
 * reaches `handler.mjs` in either state. `src/app/(payload)/admin/importMap.d.ts`
 * is the one other file that `allowJs: false` requires, for the one actual
 * JavaScript source this package ships.
 */
declare module "*/.open-next/worker.js" {
  const handler: {
    fetch(
      request: Request,
      env: CloudflareEnv,
      ctx: ExecutionContext
    ): Promise<Response>;
  };

  export default handler;
}
