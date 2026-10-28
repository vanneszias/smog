# SMOG's deepmerge security fork

This is the CommonJS implementation and type declarations from MIT-licensed
deepmerge 4.3.1, upstream commit `5b87756a5671635679001cbac72aa42f23472c81`:
https://github.com/TehShrike/deepmerge/tree/5b87756a5671635679001cbac72aa42f23472c81

The behavioral change is in `getKeys`: reject `__proto__`, `constructor` and
`prototype` from both merge inputs, fixing GHSA-gcqx-w48m-w2h4 even for
null-prototype targets, own `__proto__` properties and nested null placeholders.
The callable CommonJS API, `.all`, options and TypeScript declarations are retained.
The dependency-free CommonJS build also runs in Metro; the unused UMD build is omitted.

The root dependency and override replace every transitive `deepmerge` with this explicitly named
`@smog/deepmerge` fork. It is not an advisory exclusion or an upstream version bump.
The fork is excluded from Biome to preserve the upstream code for review.
Regression and compatibility checks are in `packages/testing/bun/shared/tooling/dependency-security.test.ts`.

Remove this directory and its override when upstream publishes a fixed compatible
release. Do not downgrade to 4.1.2: it also writes untrusted keys unsafely.
