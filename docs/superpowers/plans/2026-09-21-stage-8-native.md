# Stage 8: Native Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Expo app, `apps/mobile`, that browses, searches and plays gestures, signs people in against Payload, and keeps their favourites and lists — built on its own component library that shares `@smog/styles` and the web library's prop vocabulary, and shares none of its code.

**Architecture:** Two new workspaces. `packages/ui-native` is NativeWind v4 over React Native primitives, themed from the same `tokens` object `packages/ui-web` renders to CSS custom properties. `apps/mobile` is Expo Router over the Payload REST API, authenticated by a JWT in `expo-secure-store` rather than a cookie. The site gains a small JSON surface — sign-up, and the two reads whose rules the web already owns — built next to the endpoints it has to stay identical to, rather than re-derived in the client.

**Tech Stack:** Expo SDK 55 / React Native 0.83, Expo Router, NativeWind v4, jest-expo + `@testing-library/react-native`, Payload 3.89.0 REST, `expo-secure-store`, `expo-video`, `@shopify/flash-list`.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md` — "Repository layout", "Design language", the Stage 8 row of the stage table, and the note in `apps/site/src/endpoints/auth.ts` that the JSON surface "should be built here, next to these, and held to the same assertions".

---

## What this stage inherits, and must not rebuild

| from | item |
|---|---|
| Stage 2 | `@smog/styles` `tokens` is the only place a colour, spacing step or radius is declared. Native consumes the object directly. |
| Stage 2 | `packages/ui-web` settled the prop vocabulary: `Button` takes `variant` ∈ `primary \| secondary \| outline \| ghost \| danger` and `size` ∈ `sm \| md \| lg \| icon`. Native matches it. |
| Stage 3 | `lib/gestureQuery.ts`, `lib/gestureDetail.ts` and `lib/search.ts` hold the list, detail and cross-locale search rules. **Call them. Do not re-derive them over REST.** |
| Stage 3 | `lib/guestStore.ts` and `lib/mergeGuestState.ts` are the signed-out favourites/lists model and the merge on sign-in. |
| Stage 4 | `POST /api/users/login` is **already** a JSON endpoint returning a token, enumeration-flattened and timing-padded. Native signs in through it. Do not add a second. |
| Stage 4 | `POST /api/users` is **not** public (`isAdminOrSelfRegistration`). Sign-up needs a JSON endpoint; it does not get a second access rule. |
| Stage 4 | `isTrustedOrigin` returns `true` for an **absent** `Origin`. A native client therefore passes `guardOrigin` already — this is deliberate, and it is why no CORS configuration is needed. |
| Stage 6 | `playbackId` on a gesture is a **public** Mux playback policy (`lib/mux.ts:190`). Native plays it directly; there is no signed URL to mint. |

## Out of scope, and why

- **The sponsor wizard.** Selling a sponsorship inside an iOS app is an App
  Store review question about in-app purchase, not a technical one. The web
  flow stays the way to buy; the app links out to it. Naming this here so
  nobody reads its absence as an oversight.
- **The admin panel.** It is a web surface and stays one.
- **`apps/native`.** Untouched. It is deleted in Stage 10, not migrated in
  place, and the two apps ship side by side until then.
- **Analytics.** `apps/native` carries OpenPanel; `apps/mobile` ships with
  none, deliberately. Stage 8.5 is the stage that gives `user-consents` its
  first writer, and adding a tracker before there is a way to record a
  refusal is the mistake that stage exists to prevent. The app is built so
  that adding one later is a provider and a call site, not a retrofit.

## Global Constraints

- **Payload pinned at 3.89.0.** 3.90.x raises PBKDF2 to 600,000 against workerd's 100,000 cap.
- **Bundle: 7.36 MiB gzipped of 10.00 MiB, ~2.64 MiB headroom.** Every endpoint this stage adds to `apps/site` rides on `app/(payload)/api/[...slug]/route.ts`, which already carries the Payload/D1/drizzle graph, so it costs only the handler. **A new `app/**/route.ts` that imports Payload costs ~519 KiB and its own bundle entry; CI enforces that none exists.**
- **There are no transactions**, and **a `where` on an update is a SELECT**. The only atomic primitive is a unique index, evaluated inside the INSERT.
- **Payload's `defaultAccess` is `Boolean(user)`.** An omitted access rule is an open one. This stage adds no collection, and must not weaken one.
- **knip fails on an exported symbol nothing imports.** A component exported from `packages/ui-native` that no screen renders turns CI red. Build components in the task that consumes them, or add the entry to `knip.json` in the same commit.
- **Biome/`ultracite` bans `void` and bitwise operators.**
- **`bun release:check` is the gate**, and it runs `scripts/native-release-check.ts`, which today exports only `apps/native`. Task 5 extends it; until then nothing proves `apps/mobile` bundles at all.
- **Expo versions are pinned by the SDK.** Add a dependency with `bunx expo install <pkg>` inside `apps/mobile`, never by hand — a hand-written range is how an Expo app gets a version the SDK does not support, and `expo-doctor` is the only thing that would notice.
- **The repo pins `react` 19.2.0 and `@babel/core` 7.29.7 in root `overrides`.** `apps/mobile` inherits both; do not re-pin them locally.

## Review Focus

1. **The session token expires mid-use.** Payload's default `tokenExpiration` is 7200 s and `Users.ts` does not override it, so every signed-in person is two hours from a 401. Unhandled, the app shows an empty favourites list rather than signing them out or refreshing. → Task 6.
2. **The token in `expo-secure-store` outlives the install.** The iOS keychain survives app deletion by default, so a reinstall resumes a session — including one whose account was deleted, which answers 401 for ever unless the app clears and recovers. → Task 6.
3. **The device is offline, or the request fails.** Every screen in this app is a network read. A failure state that is indistinguishable from a slow one is a permanent spinner. → Task 8.
4. **The device locale is not `nl`, `en` or `fr`.** `Accept-Language: de-DE` must resolve to the default `nl`, and every read must carry `?locale=` — Payload answers in the default locale when it is omitted, so the bug looks like "translations do not work" rather than like a missing parameter. → Task 5.
5. **A favourited gesture is deactivated.** `publicReadActive` makes it unreadable, so a favourites list that assumes every id resolves renders a blank row or throws. → Task 9.

---

## File Structure

**Created — `packages/ui-native`**

| file | responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `babel.config.js`, `jest.config.js`, `jest.setup.ts` | workspace, types, NativeWind transform, test harness |
| `tailwind.config.js` | the generated theme, consumed by both this package and `apps/mobile` |
| `scripts/generate-theme.ts` | renders `@smog/styles` `tokens` into `tailwind.config.js` |
| `src/theme.test.ts` | drift: the committed theme still matches `tokens` |
| `src/lib/cn.ts` | `clsx` + `tailwind-merge`, the native twin of `ui-web`'s |
| `src/components/*.tsx` + `*.test.tsx` | Button, Text, Input, Card, Badge, Switch, Skeleton, EmptyState, Avatar, Sheet, Toast |
| `src/domain/*.tsx` + `*.test.tsx` | GestureCard, GestureGrid, SearchBar, CategoryFilter, VideoPlayer, StatusBadge |
| `src/vocabulary.test.ts` | the cross-platform prop-vocabulary guard |
| `src/index.ts` | the package's only entry |

**Created — `apps/mobile`**

| file | responsibility |
|---|---|
| `app.json`, `eas.json`, `metro.config.js`, `babel.config.js`, `tsconfig.json`, `package.json` | the Expo app |
| `global.css` | the single `@tailwind` entry NativeWind needs |
| `src/lib/api.ts` | `payloadFetch` — base URL, locale, `Authorization`, error shape |
| `src/lib/session.ts` | token storage, refresh, sign-out |
| `src/lib/locale.ts` | device locale → `nl \| en \| fr` |
| `src/lib/guest.ts` | signed-out favourites and lists, `AsyncStorage` only |
| `src/boundary.test.ts` | nothing here imports a package Stage 10 deletes |
| `app/**` | Expo Router screens |

**Modified — `apps/site`**

| file | change |
|---|---|
| `src/endpoints/auth.ts` | extract the sign-up decision; add `POST /api/auth/native/sign-up` |
| `src/endpoints/mobile.ts` | **new** — `GET /api/mobile/gestures`, `GET /api/mobile/search` |
| `src/payload.config.ts` | register `mobileEndpoints` |

**Modified — root**

| file | change |
|---|---|
| `scripts/native-release-check.ts` | export `apps/mobile` too |
| `knip.json` | the two new workspaces' entries |
| `package.json` | `dev:mobile`, `mobile:ios`, `mobile:android` |
| `AGENTS.md` | the mobile commands |

---

## Task 1: The NativeWind gate

This is a Stage 0-style gate, not a scaffolding task. Fifteen components are
about to be written in a styling system nothing in this repository has ever
run. **If a `className` does not become a real style — in the app and under
the test runner — the stage changes shape**, and it changes shape here, once,
rather than in Task 4 with eleven components already written.

The fallback, if the gate fails, is a `StyleSheet.create` factory fed from the
same `tokens` object. It costs the ergonomics and none of the design: the
tokens are the shared thing, NativeWind is only a way of spelling them.
Record the outcome either way in the task report; a gate that passes silently
teaches nobody anything.

**Why jest-expo and not Vitest.** The rest of this monorepo runs Vitest, and
this package will not. React Native ships Flow-typed source that only
`babel-preset-expo` strips, `react-native` resolves through a `react-native`
export condition Vitest's resolver does not apply, and `jest-expo` is the
preset Expo itself tests against. `apps/native` has run on it since before
this migration. The cost is one more runner in `turbo test`; the alternative
is a bespoke Vitest transform pipeline that is this stage's problem every time
Expo bumps.

**Files:**
- Create: `packages/ui-native/package.json`
- Create: `packages/ui-native/tsconfig.json`
- Create: `packages/ui-native/babel.config.js`
- Create: `packages/ui-native/jest.config.js`
- Create: `packages/ui-native/jest.setup.ts`
- Create: `packages/ui-native/tailwind.config.js`
- Create: `packages/ui-native/global.css`
- Create: `packages/ui-native/src/gate.test.tsx`
- Create: `packages/ui-native/nativewind-env.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `packages/ui-native` workspace whose `bun -F @smog/ui-native test` runs `.test.tsx` files with NativeWind's transform applied. Every later task in this package depends on it.

- [ ] **Step 1: Create the workspace**

`packages/ui-native/package.json`:

```json
{
  "name": "@smog/ui-native",
  "version": "2.0.2",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tailwind.config": "./tailwind.config.js",
    "./global.css": "./global.css"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "jest --runInBand",
    "test:watch": "jest --watchAll",
    "generate:theme": "bun run scripts/generate-theme.ts"
  },
  "dependencies": {
    "@smog/config": "workspace:*",
    "@smog/styles": "workspace:*",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0"
  },
  "peerDependencies": {
    "nativewind": "^4.1.23",
    "react": "^19.0.0",
    "react-native": "^0.83.0"
  },
  "devDependencies": {
    "@testing-library/react-native": "^13.2.0",
    "@types/jest": "29.5.14",
    "@types/react": "19.2.14",
    "babel-preset-expo": "~55.0.8",
    "jest": "~29.7.0",
    "jest-expo": "~55.0.22",
    "nativewind": "^4.1.23",
    "react": "19.2.0",
    "react-native": "0.83.10",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.9.3"
  }
}
```

`tailwindcss` is v3, not v4, and that is not an oversight: NativeWind 4
compiles against the v3 config format and has no v4 engine. `packages/ui-web`
stays on Tailwind v4 — the two never share a config file, only the token
object that generates both.

`packages/ui-native/babel.config.js`:

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

`packages/ui-native/jest.config.js`:

```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|\\.pnpm|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop))",
  ],
};
```

`react-native-css-interop` is NativeWind's runtime and ships untranspiled; a
`transformIgnorePatterns` that omits it fails with a syntax error on import,
which reads like a broken test rather than a broken config.

`packages/ui-native/jest.setup.ts`:

```ts
import "@testing-library/react-native/extend-expect";
```

`packages/ui-native/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`packages/ui-native/nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

Without this file `className` is not a valid prop on a React Native component
and every single component fails `check-types`.

`packages/ui-native/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "nativewind",
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "nativewind-env.d.ts"]
}
```

`packages/ui-native/tailwind.config.js` — a deliberately minimal placeholder,
replaced wholesale by the generator in Task 2:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors: { primary: "#00805F" } } },
};
```

Install from the repository root so bun links the workspace:

```bash
bun install
```

- [ ] **Step 2: Write the failing gate test**

`packages/ui-native/src/gate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

/**
 * The gate. This asserts one thing and it is the whole premise of the
 * package: a Tailwind class written on a React Native element arrives at
 * that element as a real style object, under this test runner.
 *
 * If it fails, `packages/ui-native` becomes a `StyleSheet.create` factory
 * over the same `tokens` and nothing else about Stage 8 changes.
 */
describe("the NativeWind transform", () => {
  it("turns a className into a style", () => {
    render(
      <View className="bg-primary" testID="subject">
        <Text>gate</Text>
      </View>
    );

    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: "#00805F",
    });
  });

  it("reports a different colour for a different class", () => {
    render(<View className="bg-white" testID="subject" />);

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: "#00805F",
    });
  });
});
```

The second test is what makes the first one worth anything. A `toHaveStyle`
that passes because the transform silently drops `className` and the matcher
compares two empty objects is the failure mode this gate exists to catch, and
one assertion cannot tell that apart from success.

- [ ] **Step 3: Run it and watch it fail**

```bash
bun -F @smog/ui-native test
```

Expected: FAIL. The useful failures are `Cannot find module 'nativewind'`
(install did not link) and `Invariant Violation: className` / a received
style of `undefined` (the babel preset is not applied). Record which one you
got — they have different fixes.

- [ ] **Step 4: Make it pass**

Work the failure you actually saw. In order of likelihood:

1. `nativewind/babel` missing from `babel.config.js` — the transform never runs.
2. `jsxImportSource` not set in **both** `babel.config.js` and `tsconfig.json`.
3. `react-native-css-interop` inside `transformIgnorePatterns`' negative lookahead.
4. `content` in `tailwind.config.js` not matching `src/**/*.tsx`, so the class is never compiled and resolves to nothing.

Do not "fix" it by asserting something weaker. A gate that is adjusted until
it passes has told you nothing.

- [ ] **Step 5: Run it and watch it pass**

```bash
bun -F @smog/ui-native test
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Prove the assertion is load-bearing**

Change `bg-primary` to `bg-accent` in the first test **only**, re-run, and
confirm it FAILS reporting `#EE971C`. Restore it byte for byte and confirm
PASS again. Paste both outputs into the task report.

- [ ] **Step 7: Wire it into the monorepo**

Add to `knip.json` under `workspaces`:

```json
"packages/ui-native": {
  "entry": ["src/index.ts", "tailwind.config.js", "scripts/*.ts"],
  "ignoreDependencies": ["@smog/config", "tailwindcss"]
}
```

`tailwindcss` is listed because nothing imports it — `tailwind.config.js`
`require`s `nativewind/preset` and the compiler is invoked by the babel
plugin, so knip sees an unused dependency that the build cannot run without.

Create `packages/ui-native/src/index.ts` with a single line so the knip entry
resolves; Task 3 fills it:

```ts
export {};
```

- [ ] **Step 8: Verify the whole repo still passes**

```bash
bunx knip --no-progress --no-config-hints
bun run check-types
```

Expected: both clean. `check-types` must include `@smog/ui-native`; if turbo
skips it, the package is missing its `check-types` script or is not in the
workspace glob.

- [ ] **Step 9: Commit**

```bash
git add packages/ui-native knip.json bun.lock package.json
git commit -m "feat(ui-native): prove a className becomes a style before building on it

The gate for Stage 8. Fifteen components are about to be written in a
styling system nothing in this repo has run. Two assertions rather than
one: the second is what tells a working transform apart from a dropped
className compared against an empty style object."
```

---

## Task 2: One token object, two themes

`packages/ui-web` generates `theme.css` from `tokens` with
`scripts/generate-theme.ts` and pins the result with `src/styles/theme.test.ts`,
so a token change that nobody regenerates fails CI instead of shipping a stale
stylesheet. This task is the same arrangement for native, and it exists for
the same reason the spec gives: `@smog/styles` is *the single source of truth*,
and a hand-maintained second copy is a source of truth that has stopped being
one.

**Dark mode.** `tokens.semantic` has `light` and `dark`. NativeWind reads
`dark:` variants from its own colour-scheme signal, so both halves go into the
theme: `bg-surface` and `dark:bg-surface`. Generating only `light` would
produce an app that is correct at noon.

**Files:**
- Create: `packages/ui-native/scripts/generate-theme.ts`
- Create: `packages/ui-native/src/theme.ts`
- Create: `packages/ui-native/src/theme.test.ts`
- Modify: `packages/ui-native/tailwind.config.js` (replaced by generated output)

**Interfaces:**
- Consumes: `tokens` from `@smog/styles` — `tokens.color.brand`, `tokens.color.neutral`, `tokens.color.white`, `tokens.semantic.light`, `tokens.semantic.dark`, `tokens.spacing`, `tokens.radius`, `tokens.fontSize`.
- Produces:
  - `renderTailwindConfig(): string` from `src/theme.ts` — the full text of `tailwind.config.js`.
  - `packages/ui-native/tailwind.config.js`, importable by `apps/mobile` as `@smog/ui-native/tailwind.config`.
  - Class names every later task uses: `bg-background`, `bg-surface`, `bg-surface-raised`, `bg-primary`, `bg-danger`, `text-foreground`, `text-foreground-muted`, `text-primary-foreground`, `border-border`, `border-border-subtle`, `border-border-strong`, and the `dark:` form of each.

- [ ] **Step 1: Write the failing drift test**

`packages/ui-native/src/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens } from "@smog/styles";
import { renderTailwindConfig } from "./theme";

const CONFIG = join(__dirname, "..", "tailwind.config.js");

describe("tailwind.config.js", () => {
  it("is byte-identical to what the generator produces", () => {
    expect(readFileSync(CONFIG, "utf8")).toBe(renderTailwindConfig());
  });

  it("carries the light semantic roles", () => {
    const config = renderTailwindConfig();

    expect(config).toContain(`"surface": "${tokens.semantic.light.surface}"`);
    expect(config).toContain(`"primary": "${tokens.semantic.light.primary}"`);
  });

  it("carries the dark semantic roles under a dark key", () => {
    const config = renderTailwindConfig();

    expect(config).toContain(
      `"surface-dark": "${tokens.semantic.dark.surface}"`
    );
  });

  it("does not silently agree when a role is missing", () => {
    expect(renderTailwindConfig()).not.toContain('"surface": undefined');
  });

  it("renders every spacing step", () => {
    const config = renderTailwindConfig();

    for (const [step, value] of Object.entries(tokens.spacing)) {
      expect(config).toContain(`"${step}": "${value}px"`);
    }
  });
});
```

The first test is the drift guard: it fails the moment somebody edits
`tokens.ts` without running the generator, which is the whole point. The
fourth exists because `${undefined}` stringifies happily and a missing
semantic role would otherwise pass every `toContain` around it.

- [ ] **Step 2: Run it and watch it fail**

```bash
bun -F @smog/ui-native test src/theme.test.ts
```

Expected: FAIL, `Cannot find module './theme'`.

- [ ] **Step 3: Write the generator**

`packages/ui-native/src/theme.ts`:

```ts
import { tokens } from "@smog/styles";

/**
 * Renders `@smog/styles` into the Tailwind v3 config NativeWind compiles.
 *
 * Kept as a pure string function rather than an object the config file
 * imports, for one reason: `tailwind.config.js` is loaded by the babel
 * plugin in a CommonJS context that cannot resolve a TypeScript workspace
 * import. Generating the file means the config is plain data at build time
 * and the drift test is what keeps it honest.
 *
 * Semantic roles appear twice: `surface` and `surface-dark`. NativeWind's
 * `dark:` variant needs a real class to point at, so `dark:bg-surface-dark`
 * is how a component asks for the dark role. Naming them as siblings rather
 * than nesting a `dark` palette keeps `bg-surface-dark` spellable, which a
 * nested object does not.
 */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function colors(): Record<string, string> {
  const entries: Record<string, string> = {
    white: tokens.color.white,
  };

  for (const [role, value] of Object.entries(tokens.semantic.light)) {
    entries[kebab(role)] = value;
  }

  for (const [role, value] of Object.entries(tokens.semantic.dark)) {
    entries[`${kebab(role)}-dark`] = value;
  }

  for (const [step, value] of Object.entries(tokens.color.neutral)) {
    entries[`neutral-${step}`] = value;
  }

  return entries;
}

function scale(values: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([step, value]) => [step, `${value}px`])
  );
}

export function renderTailwindConfig(): string {
  const theme = {
    colors: colors(),
    spacing: scale(tokens.spacing),
    borderRadius: scale(tokens.radius),
    fontSize: scale(tokens.fontSize),
  };

  return `/**
 * GENERATED by \`bun -F @smog/ui-native generate:theme\`. Do not edit.
 *
 * The source is \`packages/styles/src/tokens.ts\`. \`src/theme.test.ts\`
 * fails if this file and that object disagree.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: ${JSON.stringify(theme, null, 2)} },
};
`;
}
```

`tokens` exposes exactly `color` (`white`, `brand`, `neutral`, `brandScale`),
`semantic`, `spacing`, `radius`, `fontSize`, `lineHeight`, `fontWeight`,
`iconSize`, `duration`, `elevation` and `shadow`. **There is no
`tokens.color.black`** — a shade that dark is `neutral[950]`. Do not add a
token to `@smog/styles` to make something compile; the web theme generator is
the reference for what exists.

- [ ] **Step 4: Write the script and generate**

`packages/ui-native/scripts/generate-theme.ts`:

```ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderTailwindConfig } from "../src/theme";

const target = fileURLToPath(
  new URL("../tailwind.config.js", import.meta.url)
);

writeFileSync(target, renderTailwindConfig(), "utf8");
process.stdout.write(`wrote ${target}\n`);
```

```bash
bun -F @smog/ui-native generate:theme
```

- [ ] **Step 5: Run the tests**

```bash
bun -F @smog/ui-native test
```

Expected: PASS, including Task 1's gate — which now resolves `bg-primary`
through the generated theme rather than the placeholder. If the gate now
fails, the generated `primary` is not `#00805F`: check that
`tokens.semantic.light.primary` is `brandScale.primary[600]`, which is the
brand value byte for byte.

- [ ] **Step 6: Prove the drift test is load-bearing**

Append a space to the end of `tailwind.config.js`, re-run, confirm the
byte-identical test FAILS. Regenerate and confirm PASS. Then change
`tokens.semantic.light.surface` in `packages/styles/src/tokens.ts` to
`"#FF0000"`, run `bun -F @smog/ui-native test` **without** regenerating, and
confirm it FAILS — that is the case the guard actually exists for. Revert the
token. Paste all three outputs into the report.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-native
git commit -m "feat(ui-native): generate the native theme from the same tokens the web theme uses

Two renderings of one object, as the spec requires. The drift test fails
on a token edit that was never regenerated, which is the failure a
hand-maintained copy makes invisible."
```

---

## Task 3: `cn`, `Button`, and the thing that keeps the two libraries honest

The spec's promise is precise: *"a `Button` takes the same `variant` and
`size` values on web and native, so moving between the two is muscle
memory."* That is a property, and a property nothing tests decays the first
time somebody adds a `subtle` variant to one library.

So the vocabulary becomes data. `packages/ui-web` gains a module that names
the canonical variant and size sets, both libraries assert their own
components implement exactly those, and adding a variant on one platform
fails the other platform's test until it is added there too. The module is
plain string arrays with no imports, which is what lets a jest-expo test read
it without dragging React DOM into a React Native runtime.

**Files:**
- Create: `packages/ui-web/src/vocabulary.ts`
- Create: `packages/ui-web/src/vocabulary.test.ts`
- Modify: `packages/ui-web/package.json` (add the `./vocabulary` export)
- Create: `packages/ui-native/src/lib/cn.ts`
- Create: `packages/ui-native/src/lib/cn.test.ts`
- Create: `packages/ui-native/src/test/resolvedColor.ts`
- Create: `packages/ui-native/src/components/Text.tsx` (the stub Task 4 replaces)
- Create: `packages/ui-native/src/components/Button.tsx`
- Create: `packages/ui-native/src/components/Button.test.tsx`
- Modify: `packages/ui-native/src/index.ts`
- Modify: `packages/ui-native/package.json` (add `@smog/ui-web`, `class-variance-authority`)

**Interfaces:**
- Consumes: the generated theme classes from Task 2.
- Produces:
  - `@smog/ui-web/vocabulary` → `BUTTON_VARIANTS: readonly ["primary","secondary","outline","ghost","danger"]`, `BUTTON_SIZES: readonly ["sm","md","lg","icon"]`, `BADGE_VARIANTS: readonly ["neutral","primary","success","warning","danger","outline"]`, `INPUT_SIZES: readonly ["sm","md","lg"]`.
  - `cn(...inputs: ClassValue[]): string`.
  - `resolvedColor(hex: string): string` from `src/test/resolvedColor.ts` — **measured in Task 1, not guessed.** Tailwind v3 routes every colour utility through a `--tw-bg-opacity` custom property so opacity modifiers work, and NativeWind resolves that at runtime to an `rgba(r, g, b, a)` string; a hex literal is never what `toHaveStyle` receives. `resolvedColor("#00805F")` returns `"rgba(0, 128, 95, 1)"`. Every colour assertion in this package calls it on a value read from `tokens` — a hex literal in a test is a token that has escaped just as surely as one in a component.
  - `Button`, `ButtonProps`, `buttonVariants` from `@smog/ui-native`. `ButtonProps` is `PressableProps & VariantProps<typeof buttonVariants> & { children: ReactNode; loading?: boolean; className?: string }`.

- [ ] **Step 1: Read the web library's actual variant names**

```bash
sed -n '/variants: {/,/defaultVariants/p' packages/ui-web/src/components/Button.tsx
sed -n '/variants: {/,/defaultVariants/p' packages/ui-web/src/components/Badge.tsx
sed -n '/variants: {/,/defaultVariants/p' packages/ui-web/src/components/Input.tsx
```

The names written into `vocabulary.ts` must be **transcribed from that
output**, not from this plan. If they disagree, the shipped component wins
and this plan's list is the one that is wrong — say so in the task report.

- [ ] **Step 2: Write the failing vocabulary test for the web side**

`packages/ui-web/src/vocabulary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { badgeVariants } from "./components/Badge";
import { buttonVariants } from "./components/Button";
import { BADGE_VARIANTS, BUTTON_SIZES, BUTTON_VARIANTS } from "./vocabulary";

/**
 * The vocabulary is the cross-platform contract, so it is asserted against
 * the components rather than trusted.
 *
 * Distinctness is the load-bearing part. `cva` returns its base classes for
 * a variant it has never heard of, so "every name produces a class string"
 * passes for a variant that was never implemented. Requiring the strings to
 * differ from each other is what catches a name in the vocabulary that the
 * component does not actually have.
 */
describe("the shared vocabulary", () => {
  it("has a distinct implementation for every button variant", () => {
    const rendered = BUTTON_VARIANTS.map((variant) =>
      buttonVariants({ variant })
    );

    expect(new Set(rendered).size).toBe(BUTTON_VARIANTS.length);
  });

  it("has a distinct implementation for every button size", () => {
    const rendered = BUTTON_SIZES.map((size) => buttonVariants({ size }));

    expect(new Set(rendered).size).toBe(BUTTON_SIZES.length);
  });

  it("has a distinct implementation for every badge variant", () => {
    const rendered = BADGE_VARIANTS.map((variant) => badgeVariants({ variant }));

    expect(new Set(rendered).size).toBe(BADGE_VARIANTS.length);
  });

  it("names a variant the component does not have as a failure", () => {
    const withUnknown = [...BUTTON_VARIANTS, "nonsense"] as const;
    const rendered = withUnknown.map((variant) =>
      buttonVariants({ variant: variant as (typeof BUTTON_VARIANTS)[number] })
    );

    expect(new Set(rendered).size).not.toBe(withUnknown.length);
  });
});
```

The last test is the self-check: it proves the distinctness assertion can
actually fail, by feeding it a name nothing implements and requiring the
collision.

- [ ] **Step 3: Run it and watch it fail**

```bash
bun -F @smog/ui-web test src/vocabulary.test.ts
```

Expected: FAIL, `Cannot find module './vocabulary'`. If `badgeVariants` is
also reported missing, export it from `Badge.tsx` the way `Button.tsx`
exports `buttonVariants`; the package's own reference comment already
requires every component to.

- [ ] **Step 4: Write the vocabulary**

`packages/ui-web/src/vocabulary.ts`:

```ts
/**
 * The names both component libraries answer to.
 *
 * Imported by `packages/ui-native`, which is why this module has no imports
 * of its own: it is read inside a React Native test runtime, where anything
 * reaching for React DOM does not load.
 *
 * Adding a name here without implementing it on both platforms fails two
 * test suites, which is the entire purpose.
 */
export const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "danger",
] as const;

export const BUTTON_SIZES = ["sm", "md", "lg", "icon"] as const;

export const BADGE_VARIANTS = [
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
  "outline",
] as const;

/** `Badge` has only two sizes on both platforms. `Button` has four. */
export const BADGE_SIZES = ["sm", "md"] as const;

export const INPUT_SIZES = ["sm", "md", "lg"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = (typeof BUTTON_SIZES)[number];
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];
export type BadgeSize = (typeof BADGE_SIZES)[number];
export type InputSize = (typeof INPUT_SIZES)[number];
```

Add the subpath to `packages/ui-web/package.json`:

```json
"./vocabulary": "./src/vocabulary.ts"
```

- [ ] **Step 5: Run the web test to verify it passes**

```bash
bun -F @smog/ui-web test src/vocabulary.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing `cn` test**

`packages/ui-native/src/lib/cn.test.ts`:

```ts
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy entries", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("lets the last conflicting class win", () => {
    expect(cn("bg-surface", "bg-primary")).toBe("bg-primary");
  });

  it("keeps classes that only look like they conflict", () => {
    expect(cn("p-md", "px-lg")).toBe("p-md px-lg");
  });
});
```

The third test is the one that matters: `ui-web`'s `cn` exists so a caller's
`className` wins the merge rather than the cascade, and native has no
cascade at all — NativeWind applies whichever style the compiler emitted
last, which is not the same rule. `tailwind-merge` is what makes the two
behave alike.

- [ ] **Step 7: Run it and watch it fail, then implement**

```bash
bun -F @smog/ui-native test src/lib/cn.test.ts
```

Expected: FAIL, `Cannot find module './cn'`.

`packages/ui-native/src/lib/cn.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The native twin of `packages/ui-web/src/lib/cn.ts`, and deliberately the
 * same two libraries rather than a hand-rolled join.
 *
 * `tailwind-merge` is what makes `className` behave the way a web consumer
 * expects: without it, two conflicting utilities both reach NativeWind and
 * the winner is whichever the compiler emitted last — an ordering nobody at
 * the call site can see.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```bash
bun -F @smog/ui-native test src/lib/cn.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Write the failing `Button` test**

`packages/ui-native/src/components/Button.test.tsx`:

```tsx
import { tokens } from "@smog/styles";
import { BUTTON_SIZES, BUTTON_VARIANTS } from "@smog/ui-web/vocabulary";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { resolvedColor } from "../test/resolvedColor";
import { Button, buttonVariants } from "./Button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Press me</Button>);

    expect(screen.getByText("Press me")).toBeOnTheScreen();
  });

  it("is a button to assistive technology", () => {
    render(<Button>Press me</Button>);

    expect(screen.getByRole("button", { name: "Press me" })).toBeOnTheScreen();
  });

  it("calls onPress", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Press me</Button>);

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress while disabled", () => {
    const onPress = jest.fn();
    render(
      <Button disabled onPress={onPress}>
        Press me
      </Button>
    );

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress while loading", () => {
    const onPress = jest.fn();
    render(
      <Button loading onPress={onPress}>
        Press me
      </Button>
    );

    fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("reports busy while loading", () => {
    render(<Button loading>Press me</Button>);

    expect(screen.getByRole("button")).toHaveAccessibilityState({ busy: true });
  });

  it("paints the primary variant with the primary token", () => {
    render(<Button testID="subject">Press me</Button>);

    expect(screen.getByTestId("subject")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("does not paint the ghost variant with the primary token", () => {
    render(
      <Button testID="subject" variant="ghost">
        Press me
      </Button>
    );

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("lets a caller's className win the merge", () => {
    render(
      <Button className="bg-danger" testID="subject">
        Press me
      </Button>
    );

    expect(screen.getByTestId("subject")).not.toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.primary),
    });
  });

  it("implements every variant in the shared vocabulary, distinctly", () => {
    const rendered = BUTTON_VARIANTS.map((variant) =>
      buttonVariants({ variant })
    );

    expect(new Set(rendered).size).toBe(BUTTON_VARIANTS.length);
  });

  it("implements every size in the shared vocabulary, distinctly", () => {
    const rendered = BUTTON_SIZES.map((size) => buttonVariants({ size }));

    expect(new Set(rendered).size).toBe(BUTTON_SIZES.length);
  });
});
```

The seventh and eighth tests are a pair on purpose, same as Task 1's gate:
one asserts the token is applied, the other asserts a different variant does
not apply it, and only together do they distinguish a working component from
a `className` that goes nowhere.

- [ ] **Step 9: Run it and watch it fail**

```bash
bun -F @smog/ui-native test src/components/Button.test.tsx
```

Expected: FAIL, `Cannot find module './Button'`.

- [ ] **Step 10: Implement `Button`**

`packages/ui-native/src/components/Button.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

/**
 * The reference component for this package, and the native counterpart of
 * `packages/ui-web/src/components/Button.tsx`. Every other component here
 * copies this shape:
 *
 * - a `cva` config exported so the vocabulary test can interrogate it;
 * - `cn(variants, className)` with `className` LAST, so a caller's class
 *   wins the merge;
 * - `{...props}` spread after the props this component sets.
 *
 * Two things differ from web, and both are platform facts rather than
 * choices. There is no `asChild`: React Native has no element to slot into
 * and navigation is a prop on `Pressable`, not a wrapping anchor. And the
 * label is wrapped in this package's `Text` rather than accepted raw,
 * because a bare string inside a `Pressable` throws on Android.
 *
 * `accessibilityRole="button"` is set rather than inferred. `Pressable`
 * reports no role by default, so without it every button in the app is an
 * unlabelled view to a screen reader — a failure that is invisible to
 * everyone who does not use one.
 */
export const buttonVariants = cva(
  "flex-row items-center justify-center gap-sm rounded-md",
  {
    variants: {
      variant: {
        primary: "bg-primary",
        secondary: "bg-surface border border-border",
        outline: "bg-transparent border border-border-strong",
        ghost: "bg-transparent",
        danger: "bg-danger",
      },
      size: {
        sm: "h-8 px-md",
        md: "h-10 px-lg",
        lg: "h-12 px-xl",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

const labelVariants = cva("font-medium", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      danger: "text-danger-foreground",
    },
    size: { sm: "text-sm", md: "text-md", lg: "text-lg", icon: "text-md" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export type ButtonProps = Omit<PressableProps, "children" | "style"> &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode;
    /** Shows a spinner, marks the control busy and blocks interaction. */
    loading?: boolean;
    className?: string;
  };

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size,
  variant,
  ...props
}: ButtonProps) {
  const blocked = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      className={cn(
        buttonVariants({ size, variant }),
        blocked && "opacity-50",
        className
      )}
      disabled={blocked}
      {...props}
    >
      {loading ? <ActivityIndicator accessibilityElementsHidden /> : null}
      {typeof children === "string" ? (
        <Text className={labelVariants({ size, variant })}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
```

`Text` does not exist yet — Task 4 writes it. For this task, create the
minimum that makes `Button` render, and let Task 4 replace it:

```tsx
// packages/ui-native/src/components/Text.tsx
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";

export type TextProps = RNTextProps & { className?: string };

export function Text({ className, ...props }: TextProps) {
  return <RNText className={cn("text-foreground", className)} {...props} />;
}
```

- [ ] **Step 11: Run the test to verify it passes**

```bash
bun -F @smog/ui-native test
```

Expected: PASS. If `toHaveAccessibilityState` is unrecognised, `jest.setup.ts`
is not loading `@testing-library/react-native/extend-expect`.

- [ ] **Step 12: Prove the vocabulary guard is load-bearing**

Delete the `ghost` entry from `buttonVariants`' `variant` map in the **native**
Button, re-run, and confirm "implements every variant in the shared
vocabulary, distinctly" FAILS. Restore it. Then add `"subtle"` to
`BUTTON_VARIANTS` in `packages/ui-web/src/vocabulary.ts`, run **both** suites,
and confirm both FAIL — that is the cross-platform property, and it is worth
nothing unless it has been seen to fail. Restore. Paste all three outputs.

```bash
bun -F @smog/ui-native test
bun -F @smog/ui-web test src/vocabulary.test.ts
```

- [ ] **Step 13: Export and commit**

`packages/ui-native/src/index.ts`:

```ts
export { Button, type ButtonProps, buttonVariants } from "./components/Button";
export { Text, type TextProps } from "./components/Text";
export { cn } from "./lib/cn";
```

```bash
bun -F @smog/ui-native check-types
bunx knip --no-progress --no-config-hints
git add packages/ui-native packages/ui-web
git commit -m "feat(ui-native): Button, and make the shared prop vocabulary a testable thing

The spec promises the same variant and size names on both platforms. That
promise now lives in one module both libraries assert against, so adding a
variant to one fails the other."
```

Knip will report `@smog/ui-native`'s `Button` as unused until Task 7 renders
it. If it fails here, add the package to `knip.json`'s `ignoreIssues` with a
comment naming Task 7, and **remove that entry in Task 7** — a permanent
exemption is how an unused export becomes furniture.

---

## Task 4: The rest of the primitives

Eight components, all following `Button`'s shape exactly: an exported `cva`
config, `cn(variants, className)` with `className` last, props spread after
the ones the component sets.

**What this library deliberately does not ship, and why.** `ui-web` has
Dialog, DropdownMenu, Select, Table, Pagination, Tooltip and Tabs. None of
them appears here. A phone has no hover, so there is no Tooltip; a table on a
360-point screen is a list; Tabs is navigation and belongs to Expo Router;
and Dialog, DropdownMenu and Select are all the same gesture on a phone — a
sheet from the bottom, which Task 5 builds once. Shipping thin imitations of
web components to make the two inventories match would be the opposite of
"idiomatic to its platform". The *vocabulary* matches where a component
exists on both; the inventory does not have to.

**Files:**
- Create in `packages/ui-native/src/components/`, each with its `.test.tsx`: `Text.tsx` (replacing the stub), `Input.tsx`, `Card.tsx`, `Badge.tsx`, `Switch.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `Avatar.tsx`
- Modify: `packages/ui-native/src/index.ts`

**Interfaces:**
- Consumes: `cn` and the generated theme classes.
- Produces, all exported from `@smog/ui-native`:
  - `Text({ variant?: "body" | "muted" | "heading" | "title", size?: "xs" | "sm" | "md" | "lg" | "xl", className?, ...RNTextProps })`
  - `Input({ size?: InputSize, invalid?: boolean, label: string, className?, ...TextInputProps })` — `label` is **required**; see below.
  - `Card({ interactive?: boolean, className?, children })`
  - `Badge({ variant?: BadgeVariant, size?: BadgeSize, className?, children })` + `badgeVariants`
  - `Switch({ value: boolean, onValueChange: (next: boolean) => void, label: string, disabled?: boolean })`
  - `Skeleton({ className? })`
  - `EmptyState({ title: string, description?: string, action?: ReactNode })`
  - `Avatar({ name: string, uri?: string | null, size?: "sm" | "md" | "lg" })`

- [ ] **Step 1: Write the shared contract test**

Every component in this package has to satisfy three things, and a per-component
copy of each is three places for one of them to be forgotten.

`packages/ui-native/src/components/contract.test.tsx`:

```tsx
import { tokens } from "@smog/styles";
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { Switch } from "./Switch";
import { Text } from "./Text";
import { resolvedColor } from "../test/resolvedColor";

const CASES: [string, (props: { className?: string }) => ReactElement][] = [
  ["Text", (p) => <Text {...p}>text</Text>],
  ["Input", (p) => <Input label="Email" {...p} />],
  ["Card", (p) => <Card {...p}>card</Card>],
  ["Badge", (p) => <Badge {...p}>badge</Badge>],
  ["Switch", (p) => <Switch label="On" onValueChange={() => undefined} value={false} {...p} />],
  ["Skeleton", (p) => <Skeleton {...p} />],
  ["EmptyState", (p) => <EmptyState title="Nothing here" {...p} />],
  ["Avatar", (p) => <Avatar name="Ada Lovelace" {...p} />],
];

describe.each(CASES)("%s", (_name, Component) => {
  it("renders", () => {
    expect(render(<Component />).toJSON()).not.toBeNull();
  });

  it("lets a caller's className reach the root and win", () => {
    render(<Component className="bg-danger" />);

    // Every component roots at `testID="root"`; see the package convention.
    expect(screen.getByTestId("root")).toHaveStyle({
      backgroundColor: resolvedColor(tokens.semantic.light.danger),
    });
  });
});
```

The expected colour goes through `resolvedColor` (Task 3) because NativeWind
serialises every colour as `rgba(...)`, never as the hex the theme declares —
measured in Task 1. The colour itself is read from `tokens` rather than
written as a literal, deliberately: `semantic.light.danger` is a computed ramp step
(`brandScale.error[600]`, a mix of `#FF3B30` toward black), and a literal
transcribed by hand into a test is a second declaration of a token. If this
test ever fails after a token change, the generated theme was not
regenerated — which is Task 2's drift test telling you the same thing twice.

Give every component a `testID="root"` default that a caller's `testID` can
override, so this test has something to grab. Document that convention in
`src/index.ts`'s header comment.

- [ ] **Step 2: Write the per-component tests**

Each gets its own file with the behaviour that is specific to it. The
non-obvious ones, which are the reason this is a list and not one file:

| component | the test that earns its keep |
|---|---|
| `Text` | a `variant="muted"` renders a different colour than `variant="body"` — the pair, not one assertion |
| `Input` | it has an accessible name from `label` **without** rendering a visible label, because `accessibilityLabel` is the only name a `TextInput` gets on iOS; and `invalid` sets `accessibilityState.invalid` rather than only a border colour |
| `Card` | `interactive` changes the border role (`border-border` vs `border-border-subtle`), asserted as two different colours |
| `Badge` | every `BADGE_VARIANTS` entry renders distinctly, imported from `@smog/ui-web/vocabulary` exactly as `Button`'s does |
| `Switch` | pressing it calls `onValueChange` with the **negation** of `value`, and a disabled one does not call it at all |
| `Skeleton` | it is hidden from assistive technology (`accessibilityElementsHidden`), because a loading placeholder announced as content is worse than silence |
| `EmptyState` | the title is a heading to assistive technology (`accessibilityRole="header"`) |
| `Avatar` | with no `uri` it renders initials derived from `name` — and "Ada Lovelace" gives "AL" while "Ada" gives "A", so a single-word name does not crash on `parts[1]` |

`Input`'s required `label` is the decision worth defending. A `TextInput`
with a placeholder and no label is the single most common accessibility
failure in React Native apps, and making the prop optional is how every one
of them happens. Required, with a test, it cannot.

- [ ] **Step 3: Run the tests and watch them fail**

```bash
bun -F @smog/ui-native test
```

Expected: FAIL, eight `Cannot find module` errors plus the contract file.

- [ ] **Step 4: Implement the components**

Follow `Button.tsx` exactly. Colour classes come from the generated theme —
`bg-surface`, `text-foreground-muted`, `border-border-subtle` — never a hex
literal. A hex in a component file is a token that has escaped, and
`@smog/styles` stops being the single source of truth the moment one lands.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
bun -F @smog/ui-native test
bun -F @smog/ui-native check-types
```

Expected: PASS.

- [ ] **Step 6: Prove two assertions are load-bearing**

Change `Switch`'s handler from `onValueChange(!value)` to `onValueChange(value)`,
re-run, confirm FAIL. Restore. Remove `accessibilityLabel` from `Input`,
re-run, confirm FAIL. Restore. Paste both.

- [ ] **Step 7: Export and commit**

```bash
git add packages/ui-native
git commit -m "feat(ui-native): the eight primitives, and a contract every one of them answers

Input's label is required rather than optional, which is the only
arrangement under which a TextInput cannot ship without an accessible
name. No Dialog, Select, Table, Tooltip or Tabs: a phone has one gesture
for all of them and it is a sheet."
```

---

## Task 5: `Sheet` and `Toast`

The two components in this package with real behaviour, and the two that
replace five web components between them. They get their own task because a
reviewer can reject either one without touching Task 4.

**Files:**
- Create: `packages/ui-native/src/components/Sheet.tsx` + `Sheet.test.tsx`
- Create: `packages/ui-native/src/components/Toast.tsx` + `Toast.test.tsx`
- Modify: `packages/ui-native/package.json` (add `@gorhom/bottom-sheet`, `react-native-gesture-handler`, `react-native-reanimated` as peers)
- Modify: `packages/ui-native/src/index.ts`, `jest.setup.ts`

**Interfaces:**
- Produces:
  - `Sheet({ open: boolean, onClose: () => void, title: string, children })` — controlled, no internal open state.
  - `ToastProvider({ children })` and `useToast(): { show: (message: string, options?: { variant?: "neutral" | "danger" }) => void }`.

- [ ] **Step 1: Write the failing `Sheet` tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(
      <Sheet onClose={() => undefined} open={false} title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.queryByText("contents")).toBeNull();
  });

  it("renders its contents while open", () => {
    render(
      <Sheet onClose={() => undefined} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.getByText("contents")).toBeOnTheScreen();
  });

  it("names itself to assistive technology", () => {
    render(
      <Sheet onClose={() => undefined} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    expect(screen.getByLabelText("Filters")).toBeOnTheScreen();
  });

  it("calls onClose when the close control is pressed", () => {
    const onClose = jest.fn();
    render(
      <Sheet onClose={onClose} open title="Filters">
        <Text>contents</Text>
      </Sheet>
    );

    fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

The first two are a pair for the reason Stage 6 recorded the hard way: **an
absence assertion passes on a component that has not rendered yet**. Asserting
only "closed renders nothing" would pass on a `Sheet` that renders nothing
ever.

- [ ] **Step 2: Decide the implementation, with a measurement**

`@gorhom/bottom-sheet` is what `apps/native` already uses, and it brings
`react-native-gesture-handler` and `react-native-reanimated` with it. Before
adding it, check what a plain `Modal` with `presentationStyle="pageSheet"`
costs instead:

```bash
bun -F mobile export 2>&1 | tail -20   # after Task 7; record both numbers then
```

If the sheet is used only for the category filter and the list picker — which
is what Tasks 10 and 11 need — a `Modal` is the smaller, dependency-free
answer and the gesture-driven one is a want. **Record which you chose and the
number that decided it.** Either satisfies the tests above, which is
deliberate: they assert the behaviour, not the library.

- [ ] **Step 3: Run, implement, run**

```bash
bun -F @smog/ui-native test src/components/Sheet.test.tsx
```

Expected: FAIL, then PASS. If you chose `@gorhom/bottom-sheet`, add its jest
mock to `jest.setup.ts` — it renders through Reanimated, which does not run
under the test renderer unmocked:

```ts
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);
```

- [ ] **Step 4: Write the failing `Toast` tests**

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

function Subject() {
  const { show } = useToast();

  return <Button onPress={() => show("Saved")}>Save</Button>;
}

describe("Toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows nothing until something is shown", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows the message", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Saved")).toBeOnTheScreen();
  });

  it("dismisses itself", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("announces itself to assistive technology", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Saved")).toHaveProp("accessibilityLiveRegion", "polite");
  });

  it("throws outside a provider rather than silently doing nothing", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<Subject />)).toThrow(/ToastProvider/);

    spy.mockRestore();
  });
});
```

The last one is the difference between a bug that is found in development and
one that is found when a save silently stops confirming in production. A
`useContext` that returns a no-op default is the shape that makes it the
second.

- [ ] **Step 5: Run, implement, run**

```bash
bun -F @smog/ui-native test
bun -F @smog/ui-native check-types
```

Expected: PASS.

- [ ] **Step 6: Prove the dismissal test is load-bearing**

Remove the `setTimeout` that clears the message, re-run, confirm "dismisses
itself" FAILS. Restore. Paste the output.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-native
git commit -m "feat(ui-native): a sheet and a toast, which between them replace five web components

Sheet asserts both directions, because an absence assertion passes on a
component that never renders. useToast throws outside its provider rather
than returning a no-op, so a missing provider is a crash in development
and not a save that stops confirming in production."
```

---

## Task 6: Domain components

Six components, matching `packages/ui-web/src/domain/` name for name and
prop for prop where the prop means the same thing on a phone.

**Files:**
- Create in `packages/ui-native/src/domain/`, each with its `.test.tsx`: `GestureCard.tsx`, `GestureGrid.tsx`, `SearchBar.tsx`, `CategoryFilter.tsx`, `VideoPlayer.tsx`, `StatusBadge.tsx`
- Modify: `packages/ui-native/src/index.ts`, `package.json` (add `expo-video`, `@shopify/flash-list` as peers)

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces:
  - `GestureSummary = { id: string; name: string; categories?: readonly { id: string; name: string }[]; playbackId?: string | null }` — **the same type `ui-web` declares**, redeclared here rather than imported, because importing it would pull a DOM module into a React Native bundle. A test asserts the two stay identical; see Step 2.
  - `GestureCard({ gesture, onPress?, onFavorite?, isFavorite?, favoriteLabel? })` — `onPress` replaces web's `renderLink`: a phone has no anchor, and this package must not import a router any more than the web one does.
  - `GestureGrid({ gestures, renderItem?, onEndReached?, loading?, empty? })`
  - `SearchBar({ onSearch, defaultValue?, delay?, label?, placeholder?, clearLabel? })` — identical to web's.
  - `CategoryFilter({ categories, selected, onChange, allLabel? })`
  - `VideoPlayer({ playbackId, title, autoPlay?, loop? })`
  - `StatusBadge({ status })`. `SPONSORSHIP_STATUS_LABELS` currently lives in `packages/ui-web/src/domain/StatusBadge.tsx`; **move it into `packages/ui-web/src/vocabulary.ts`** in this task, re-export it from its old location so no web call site changes, and import it here. It is a shared vocabulary in exactly the sense Task 3 established, and it cannot be imported from `StatusBadge.tsx` because that module reaches `Badge.tsx` and React DOM.

- [ ] **Step 1: Write the failing `GestureCard` tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { GestureCard } from "./GestureCard";

const GESTURE = {
  id: "1",
  name: "Aangenaam kennis met je te maken",
  categories: [{ id: "c1", name: "Begroeting" }],
  playbackId: "abc",
};

describe("GestureCard", () => {
  it("shows the gesture's name", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.getByText(GESTURE.name)).toBeOnTheScreen();
  });

  it("keeps a long name on one line", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.getByText(GESTURE.name)).toHaveProp("numberOfLines", 1);
  });

  it("is not a button without onPress", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.queryByRole("button", { name: GESTURE.name })).toBeNull();
  });

  it("is a button with onPress", () => {
    const onPress = jest.fn();
    render(<GestureCard gesture={GESTURE} onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: /Aangenaam/ }));

    expect(onPress).toHaveBeenCalledWith("1");
  });

  it("renders no favourite control without onFavorite", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.queryByLabelText("Favourite")).toBeNull();
  });

  it("keeps one accessible name in both favourite states", () => {
    const { rerender } = render(
      <GestureCard
        favoriteLabel="Favourite"
        gesture={GESTURE}
        isFavorite={false}
        onFavorite={() => undefined}
      />
    );

    expect(screen.getByLabelText("Favourite")).toHaveAccessibilityState({
      selected: false,
    });

    rerender(
      <GestureCard
        favoriteLabel="Favourite"
        gesture={GESTURE}
        isFavorite
        onFavorite={() => undefined}
      />
    );

    expect(screen.getByLabelText("Favourite")).toHaveAccessibilityState({
      selected: true,
    });
  });

  it("renders a gesture with no categories", () => {
    render(<GestureCard gesture={{ id: "2", name: "Hallo" }} />);

    expect(screen.getByText("Hallo")).toBeOnTheScreen();
  });
});
```

The sixth test is `ui-web`'s rule carried over verbatim, and it is carried
over because it was right: relabelling a toggle between "add" and "remove"
reads as a different control each time it is pressed. Web reports the state
through `aria-pressed`; React Native's equivalent is
`accessibilityState.selected` on a `role="button"`, which is what iOS and
Android actually announce.

The last test is the `GestureSummary` optional fields meaning what they say.
A gesture with no categories is the ordinary case for a newly seeded row, and
`categories.map` on `undefined` is how it crashes.

- [ ] **Step 2: Write the type-parity test**

`packages/ui-native/src/domain/summary.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `GestureSummary` is declared twice — once in each component library —
 * because importing the web one would pull a module graph that reaches
 * `@mux/mux-player-react` into a React Native bundle. Two declarations of
 * one type is exactly the drift this repository keeps catching, so the two
 * are compared as text.
 *
 * The comparison is deliberately crude: it normalises whitespace and
 * compares the field lines. A rename, an added field or a changed optionality
 * fails it. A reordering does not, which is the one difference worth
 * tolerating to keep this readable.
 */
function summaryFields(source: string): string[] {
  const body = source.slice(
    source.indexOf("GestureSummary"),
    source.indexOf("}", source.indexOf("GestureSummary"))
  );

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(";"))
    .sort();
}

const WEB = join(
  __dirname,
  "../../../ui-web/src/domain/GestureCard.tsx"
);
const NATIVE = join(__dirname, "GestureCard.tsx");

describe("GestureSummary", () => {
  it("declares the same fields on both platforms", () => {
    expect(summaryFields(readFileSync(NATIVE, "utf8"))).toEqual(
      summaryFields(readFileSync(WEB, "utf8"))
    );
  });

  it("found something to compare", () => {
    // A path typo would make both sides `[]` and the test above vacuous.
    expect(summaryFields(readFileSync(WEB, "utf8")).length).toBeGreaterThan(2);
  });
});
```

The second test is the self-check this repository has needed three times now:
two empty arrays are equal, and a broken path is how an assertion becomes
decoration.

- [ ] **Step 3: Write the remaining domain tests**

| component | the tests that earn their keep |
|---|---|
| `GestureGrid` | renders every gesture; renders `empty` when the list is empty **and** does not render it when the list is not; calls `onEndReached` once when the end is reached, not once per render |
| `SearchBar` | typing is debounced (one call for a word typed at speed, verified with fake timers); submitting reports immediately **and** cancels the pending debounce, so the query does not arrive twice; clearing reports `""` immediately and returns focus to the field |
| `CategoryFilter` | the "all" chip is selected when `selected` is empty; pressing a chip calls `onChange` with that id; pressing a selected chip calls `onChange` with `null` — a filter you cannot turn off is the bug |
| `VideoPlayer` | renders a player for a `playbackId`; renders a labelled placeholder for a `null` one rather than an empty box; the accessible name is the gesture's `title` |
| `StatusBadge` | every sponsorship status has a label and they are distinct, driven from `SPONSORSHIP_STATUS_LABELS` the same way the vocabulary tests are |

`VideoPlayer` builds its source from the public Mux HLS URL —
`https://stream.mux.com/{playbackId}.m3u8` — because Stage 6 set
`playback_policy: ["public"]` (`apps/site/src/lib/mux.ts:190`). There is no
signed URL to mint and no token to fetch. If that policy ever changes this
component is one of the two places that breaks; the other is
`packages/ui-web/src/domain/VideoPlayer.tsx`.

- [ ] **Step 4: Run the tests to verify they fail, implement, run to verify they pass**

```bash
bun -F @smog/ui-native test
bun -F @smog/ui-native check-types
```

Mock `expo-video` in `jest.setup.ts`; it reaches for a native module that
does not exist under the test renderer.

- [ ] **Step 5: Prove two assertions are load-bearing**

Remove the `clearTimeout` from `SearchBar`'s submit path, re-run, confirm the
"cancels the pending debounce" test FAILS. Restore. Change the `GestureCard`
favourite control to relabel itself between states, re-run, confirm the
accessible-name test FAILS. Restore. Paste both.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-native packages/ui-web
git commit -m "feat(ui-native): the six domain components, and a guard on the type they share

GestureSummary is declared in both libraries because importing the web
one drags a Mux player into a React Native bundle. The two declarations
are compared as text, with a self-check, because two empty arrays are
equal."
```

---

## Task 7: `apps/mobile`, and the one request function everything goes through

The app itself. Nothing in it renders yet beyond a kitchen-sink route proving
the component library works inside a real Expo app — the screens are Tasks
10 to 12. What this task delivers is the part every screen depends on: a
single request function that knows the base URL, the locale, the session and
what a Payload error looks like.

**Why one function and not a client per resource.** Four things have to be
true of every request this app makes — the right base URL, `?locale=`, the
`Authorization` header when there is a session, and a 401 that clears it —
and four places for each of them is how three of them end up true in five
screens and false in the sixth.

**Files:**
- Create: `apps/mobile/package.json`, `app.json`, `eas.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `global.css`, `tailwind.config.js`
- Create: `apps/mobile/src/lib/api.ts` + `api.test.ts`
- Create: `apps/mobile/src/lib/locale.ts` + `locale.test.ts`
- Create: `apps/mobile/src/boundary.test.ts`
- Create: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Modify: `scripts/native-release-check.ts`, `knip.json`, root `package.json`, `AGENTS.md`

**Interfaces:**
- Consumes: `@smog/ui-native`.
- Produces:
  - `payloadFetch<T>(path: string, init?: RequestInit & { locale?: Locale; auth?: boolean }): Promise<T>` — throws `ApiError` on a non-2xx.
  - `class ApiError extends Error { constructor(code: string, status: number); readonly status: number; readonly code: string }` — `code` is Payload's first error message, or `"network"` when the request never completed. Argument order is `(code, status)`; Task 9 constructs one directly.
  - `resolveLocale(tags: readonly string[]): Locale` and `type Locale = "nl" | "en" | "fr"`.
  - `API_BASE_URL: string`, read from `process.env.EXPO_PUBLIC_API_URL`.

- [ ] **Step 1: Create the app**

```bash
cd apps && bunx create-expo-app@latest mobile --template blank-typescript && cd ..
```

Then, from `apps/mobile`, and **only** with `expo install` so the SDK picks
the versions:

```bash
bunx expo install expo-router expo-secure-store expo-localization expo-video \
  react-native-safe-area-context react-native-screens \
  @react-native-async-storage/async-storage @shopify/flash-list \
  nativewind react-native-reanimated
bun add -d tailwindcss@^3.4.17 jest-expo@~55.0.22 jest@~29.7.0 \
  @testing-library/react-native @types/jest
bun add @smog/ui-native@workspace:* @smog/styles@workspace:* @smog/i18n@workspace:*
```

Set `"name": "mobile"` and `"main": "expo-router/entry"` in
`apps/mobile/package.json`, and give it the same `jest` config shape as
`packages/ui-native`. `app.json` needs a **new** `ios.bundleIdentifier` and
`android.package` — not `apps/native`'s. Two apps sharing a bundle
identifier cannot be installed side by side, which is precisely what this
stage needs them to do until Stage 10. Use the existing value with a
`.next` suffix and record it in the task report;
`scripts/release-config-check.ts` asserts `apps/native`'s and must keep
passing untouched.

`apps/mobile/tailwind.config.js`:

```js
const base = require("@smog/ui-native/tailwind.config");

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui-native/src/**/*.{ts,tsx}",
  ],
};
```

The third `content` entry is load-bearing and easy to leave out: Tailwind
compiles only the classes it can see, and the component library's classes
live outside this app's directory. Without it every component renders
unstyled, in the app only — the package's own tests keep passing, which is
what makes it confusing.

- [ ] **Step 2: Write the failing boundary test**

`apps/mobile/src/boundary.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing in this app may import a package Stage 10 deletes.
 *
 * `apps/mobile` exists to replace `apps/native`, and the whole point of it
 * being a new app rather than an edit of the old one is that it never
 * acquires a dependency on Convex, WorkOS or the oRPC client. An import
 * added "just for now" is how the cutover stage discovers it has a migration
 * to do rather than a deletion.
 *
 * Modelled on `apps/site/src/authBoundary.test.ts`, including its
 * file-count self-check: a glob that matches nothing passes every assertion
 * in this file.
 */
const FORBIDDEN = [
  "@smog/api",
  "@smog/auth",
  "@smog/convex",
  "@smog/hooks",
  "@smog/ui",
  "convex",
  "@workos-inc",
];

const ROOT = join(__dirname, "..");

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      sources(full, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }

  return found;
}

describe("the mobile app's dependency boundary", () => {
  const files = [...sources(join(ROOT, "app")), ...sources(join(ROOT, "src"))];

  it("found files to check", () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it.each(FORBIDDEN)("imports nothing from %s", (pkg) => {
    const offenders = files.filter((file) =>
      new RegExp(`from ["']${pkg.replace("/", "\\/")}`).test(
        readFileSync(file, "utf8")
      )
    );

    expect(offenders).toEqual([]);
  });

  it("lists none of them in package.json either", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    expect(
      FORBIDDEN.filter((pkg) => manifest.dependencies?.[pkg] !== undefined)
    ).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the failing `locale` tests**

```ts
import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("takes the first supported tag", () => {
    expect(resolveLocale(["fr-BE", "nl-BE"])).toBe("fr");
  });

  it("matches on the language subtag", () => {
    expect(resolveLocale(["en-US"])).toBe("en");
  });

  it("falls back to nl for an unsupported language", () => {
    expect(resolveLocale(["de-DE"])).toBe("nl");
  });

  it("skips an unsupported tag to reach a supported one", () => {
    expect(resolveLocale(["de-DE", "fr-FR"])).toBe("fr");
  });

  it("falls back to nl for no tags at all", () => {
    expect(resolveLocale([])).toBe("nl");
  });

  it("is case-insensitive", () => {
    expect(resolveLocale(["FR"])).toBe("fr");
  });
});
```

`nl` is the fallback because `payload.config.ts` sets
`defaultLocale: "nl"`. This is Review Focus item 4, and the fourth test is
the one that catches the common wrong implementation — taking the first tag
and then validating it, rather than finding the first tag that validates.

- [ ] **Step 4: Write the failing `payloadFetch` tests**

```ts
import { ApiError, payloadFetch } from "./api";

const ok = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  );

describe("payloadFetch", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => ok({ docs: [] })) as unknown as typeof fetch;
  });

  it("requests against the configured base URL", async () => {
    await payloadFetch("/gestures");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/gestures"),
      expect.anything()
    );
  });

  it("sends the locale on every read", async () => {
    await payloadFetch("/gestures", { locale: "fr" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("locale=fr"),
      expect.anything()
    );
  });

  it("sends no Authorization header without a session", async () => {
    await payloadFetch("/gestures");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];

    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });

  it("throws ApiError carrying the status on a 4xx", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: "Forbidden" }] }), {
          status: 403,
        })
      )
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toMatchObject({
      status: 403,
      code: "Forbidden",
    });
  });

  it("throws ApiError with code network when the request never completes", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("does not swallow a non-JSON error body", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("<html>502</html>", { status: 502 }))
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toBeInstanceOf(ApiError);
  });
});
```

The last two are Review Focus item 3. A Cloudflare error page is HTML, and a
client that does `await response.json()` on every failure throws a
`SyntaxError` from inside the catch — which surfaces as "Unexpected token <"
in an alert, and tells the person nothing.

- [ ] **Step 5: Run them all, watch them fail, implement, run again**

```bash
bun -F mobile test
bun -F mobile check-types
```

`API_BASE_URL` comes from `process.env.EXPO_PUBLIC_API_URL` with the staging
Worker as its default. It must be read **inside** the function, not at module
scope: Stage 5 lost a build to a client constructed at module scope from an
unset variable, and the same shape here makes the app un-importable under a
test runner that has not set the variable.

- [ ] **Step 6: Prove the app builds at all**

Extend `scripts/native-release-check.ts` so `bun release:check` covers this
app:

```ts
if (hasNpm()) {
  run(["bun", "x", "expo-doctor", "apps/native"]);
  run(["bun", "x", "expo-doctor", "apps/mobile"]);
} else {
  console.warn(
    "[nativeReleaseCheck] Skipping expo-doctor because npm is unavailable in this environment"
  );
}

run(["bun", "-F", "native", "export"]);
run(["bun", "-F", "mobile", "export"]);
```

```bash
bun run native:release-check
```

Expected: both exports succeed. **Record `apps/mobile`'s export size.** It is
this stage's equivalent of the Worker bundle number and nothing else is
watching it. A local `expo-doctor` failure about duplicate copies of `react`
or an "unexpected server response" is the sandbox, not the change — AGENTS.md
says so; confirm against CI rather than chasing it.

- [ ] **Step 7: Render one screen, so the library is proven inside a real app**

`apps/mobile/app/index.tsx` renders one of each component from
`@smog/ui-native` — the native counterpart of the web kitchen-sink route.
This is what removes the knip exemption Task 3 added, and it is the only
thing that would catch the missing third `content` entry from Step 1.

```bash
bun -F mobile dev
```

Open it on a device or simulator and confirm the components are **styled**.
A screenshot goes in the task report. This is the one check in this stage
that no test performs.

- [ ] **Step 8: Wire up the repo and commit**

Add to `knip.json`:

```json
"apps/mobile": {
  "entry": ["app/**/*.{ts,tsx}", "src/**/*.ts", "metro.config.js", "tailwind.config.js"],
  "ignoreDependencies": ["@babel/core", "tailwindcss"]
}
```

Add to root `package.json`: `"dev:mobile": "turbo -F mobile dev"`,
`"mobile:ios": "turbo -F mobile ios --"`, `"mobile:android": "turbo -F mobile android --"`.
Add the same four commands to `AGENTS.md` beside the native app's.

```bash
bunx knip --no-progress --no-config-hints
git add apps/mobile scripts knip.json package.json AGENTS.md bun.lock
git commit -m "feat(mobile): the app, and the one request function every screen uses

Base URL, locale, Authorization and the 401 in one place, because four
places is how three of them end up true in five screens and false in the
sixth. release:check now exports this app too — nothing else proves it
builds."
```

---

## Task 8: The session, and the one endpoint the site is missing

**Four of the five things this app needs already exist**, and the first job
of this task is not to rebuild them. Payload mounts them on the `users`
collection, they all read `Authorization: JWT <token>`, and Stage 4 already
hardened the one that needed it:

| need | endpoint | state |
|---|---|---|
| sign in | `POST /api/users/login` | **shipped**, shadowed by `usersLogin`: JSON in, token in the body, enumeration-flattened, timing-padded |
| who am I | `GET /api/users/me` | Payload's |
| stay signed in | `POST /api/users/refresh-token` | Payload's |
| sign out | `POST /api/users/logout` | Payload's — and it really does revoke, `signOut` calls the same `logoutOperation` |
| forgot password | `POST /api/users/forgot-password` | Payload's |
| **sign up** | — | **missing.** `POST /api/users` is `isAdminOrSelfRegistration`, and `/auth/sign-up` answers 303 |

So exactly one endpoint gets built, and `endpoints/auth.ts` already says how:
*"When a JSON surface is needed — the Stage 8 native app — it should be built
here, next to these, and held to the same assertions."*

**The assertion it has to be held to.** Sign-up's whole value is that a free
address and a taken one leave the server as the same bytes. A second response
format is a second place for that to be true in — which the file argues
against in as many words — so the property does not get a second
implementation: the *decision* is extracted into one function returning one
of three outcomes, and the two handlers are renderers over it. One place
where "created" and "already registered" are the same value.

**Files:**
- Modify: `apps/site/src/endpoints/auth.ts` (extract `decideSignUp`, add `mobileSignUp`)
- Modify: `apps/site/src/endpoints/auth.int.test.ts`
- Modify: `apps/site/src/payload.config.ts` (register `mobileAuthEndpoints`)
- Create: `apps/mobile/src/lib/session.ts` + `session.test.ts`
- Create: `apps/mobile/app/(auth)/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`
- Modify: `apps/mobile/src/lib/api.ts` (the `auth` option and the 401 path)

**Interfaces:**
- Consumes: `payloadFetch`, `ApiError` from Task 7.
- Produces, from `apps/site`:
  - `decideSignUp(req: PayloadRequest, input: { email: string; password: string }): Promise<"accepted" | "invalid-email" | "weak-password">` — `"accepted"` covers **both** a created account and an address already registered.
  - `POST /api/mobile/sign-up`, body `{ email, password }`, answering `200 {"status":"accepted"}`, `400 {"status":"invalid-email"}` or `400 {"status":"weak-password"}`.
- Produces, from `apps/mobile`:
  - `signIn(email: string, password: string): Promise<void>`, `signUp(email: string, password: string): Promise<"accepted" | "invalid-email" | "weak-password">`, `signOut(): Promise<void>`, `refresh(): Promise<void>`, `getToken(): Promise<string | null>`, `storeToken(token: string): Promise<void>`, `clearToken(): Promise<void>`, `useSession(): { user: User | null; loading: boolean }`, `SessionProvider`.
  - `TOKEN_KEY: string` and `INSTALL_MARKER: string`, the two storage keys, exported so the tests name them rather than repeat the literal.

- [ ] **Step 1: Write the failing test for the extraction, before extracting**

Add to `apps/site/src/endpoints/auth.int.test.ts`:

```ts
describe("decideSignUp", () => {
  it("answers the same for a free address and a registered one", async () => {
    const free = await decideSignUp(req, {
      email: "nobody@example.test",
      password: "correct horse battery staple",
    });

    // The first call registered it. The second is the taken-address branch.
    const taken = await decideSignUp(req, {
      email: "nobody@example.test",
      password: "correct horse battery staple",
    });

    expect(free).toBe("accepted");
    expect(taken).toBe("accepted");
  });

  it("reports a malformed address", async () => {
    await expect(
      decideSignUp(req, { email: "not-an-address", password: "correct horse battery staple" })
    ).resolves.toBe("invalid-email");
  });

  it("reports a weak password", async () => {
    await expect(
      decideSignUp(req, { email: "weak@example.test", password: "x" })
    ).resolves.toBe("weak-password");
  });

  it("really did create the first account", async () => {
    const found = await payload.find({
      collection: "users",
      where: { email: { equals: "nobody@example.test" } },
    });

    expect(found.totalDocs).toBe(1);
  });
});
```

The fourth test is what stops the first from being vacuous: a `decideSignUp`
that returned `"accepted"` without creating anything would satisfy the first
three perfectly.

- [ ] **Step 2: Run it, watch it fail, extract**

```bash
bun -F site test src/endpoints/auth.int.test.ts
```

Extract the body of the existing `signUp` handler — the email-shape check,
the `payload.create` with its three guards, and the `validationPaths`
branching — into `decideSignUp`, unchanged. **Move no logic and change no
guard.** `context: { [SELF_REGISTRATION]: true }`, the field-by-field `data`,
the literal `role: "user"` and `overrideAccess: false` all travel together;
Stage 4's mutation sweep proved that removing any two of them mints an admin.

`signUp` becomes:

```ts
const signUp: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));

  const outcome = await decideSignUp(req, {
    email: normaliseEmail(form.get("email")),
    password: field(form, "password"),
  });

  await pad(started);

  if (outcome === "invalid-email") {
    return seeOther(signUpPath(locale, { error: "email" }));
  }

  if (outcome === "weak-password") {
    return seeOther(signUpPath(locale, { error: "password" }));
  }

  /*
   * Both a created account and an address already registered land here, and
   * **sign-up does not sign you in** — see the note this comment was
   * extracted from. Auto-signing-in would make the taken-address branch
   * answer without a session, which is a one-request oracle no matter how
   * carefully the body is matched.
   */
  return seeOther(signInPath(locale, { notice: "registered" }));
};
```

Run the **whole** existing auth suite. Every assertion Stage 4 wrote about
sign-up must still pass, untouched. If one needed editing, the extraction
changed behaviour and is wrong.

```bash
bun -F site test src/endpoints/auth.int.test.ts src/endpoints/account.int.test.ts
```

- [ ] **Step 3: Write the failing test for the JSON endpoint**

```ts
describe("POST /api/mobile/sign-up", () => {
  const post = (body: unknown) =>
    fetch(`${BASE}/api/mobile/sign-up`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

  it("answers byte-identically for a free address and a registered one", async () => {
    const first = await post({ email: "json@example.test", password: PASSWORD });
    const second = await post({ email: "json@example.test", password: PASSWORD });

    expect(first.status).toBe(second.status);
    expect(await first.text()).toBe(await second.text());
  });

  it("created the account on the first call", async () => {
    const found = await payload.find({
      collection: "users",
      where: { email: { equals: "json@example.test" } },
    });

    expect(found.totalDocs).toBe(1);
  });

  it("never returns a token", async () => {
    const body = await (
      await post({ email: "token@example.test", password: PASSWORD })
    ).text();

    expect(body).not.toMatch(/token/i);
  });

  it("gives the new account the user role, not admin", async () => {
    await post({ email: "role@example.test", password: PASSWORD });

    const found = await payload.find({
      collection: "users",
      where: { email: { equals: "role@example.test" } },
    });

    expect(found.docs[0]?.role).toBe("user");
  });

  it("cannot be used to mint an admin", async () => {
    await post({ email: "admin@example.test", password: PASSWORD, role: "admin" });

    const found = await payload.find({
      collection: "users",
      where: { email: { equals: "admin@example.test" } },
    });

    expect(found.docs[0]?.role).toBe("user");
  });

  it("refuses a cross-site POST", async () => {
    const response = await fetch(`${BASE}/api/mobile/sign-up`, {
      body: JSON.stringify({ email: "csrf@example.test", password: PASSWORD }),
      headers: { "Content-Type": "application/json", Origin: "https://evil.test" },
      method: "POST",
    });

    expect(response.status).toBe(403);
  });

  it("takes at least the auth floor even for a malformed address", async () => {
    const started = Date.now();
    await post({ email: "nope", password: PASSWORD });

    expect(Date.now() - started).toBeGreaterThanOrEqual(AUTH_FLOOR_MS);
  });
});
```

The cross-site test is the one that is easy to think unnecessary here.
`isTrustedOrigin` treats an **absent** `Origin` as trusted, which is what
lets a native client through at all — so the guard's remaining job is
exactly this case, and it is the only case left that can fail.

- [ ] **Step 4: Implement the endpoint and register it**

```ts
const mobileSignUp: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const started = Date.now();
  const body = await readBody(req);

  const outcome = await decideSignUp(req, {
    email: normaliseEmail(
      typeof body.email === "string" ? body.email : ""
    ),
    password: typeof body.password === "string" ? body.password : "",
  });

  await pad(started);

  return Response.json(
    { status: outcome },
    {
      headers: headersWithCors({
        headers: new Headers({ "Cache-Control": "no-store" }),
        req,
      }),
      status: outcome === "accepted" ? 200 : 400,
    }
  );
};

export const mobileAuthEndpoints: Endpoint[] = [
  { handler: mobileSignUp, method: "post", path: "/mobile/sign-up" },
];
```

`/mobile/sign-up` is a **flat sibling**, not `/auth/sign-up/json`, for the
reason `endpoints/lists.ts` gives about `/account/confirm-email`: overlapping
patterns leave Payload's endpoint matcher to choose, and the wrong choice
here answers "accepted" without accepting.

Register `mobileAuthEndpoints` in `payload.config.ts`'s `endpoints` array and
extend the comment block above it with one paragraph saying what this is and
why the decision is shared.

- [ ] **Step 5: Run and prove the shared decision is load-bearing**

```bash
bun -F site test src/endpoints/auth.int.test.ts
```

Then the mutation that matters: make `decideSignUp` return a fourth outcome
`"taken"` on the already-registered branch and have `mobileSignUp` render it.
Confirm "answers byte-identically" FAILS **and** that the form endpoint's own
Stage 4 enumeration test still passes — which is the point: one decision,
two renderers, and a leak introduced in one is caught by the other's suite
staying green while this one goes red. Restore. Paste both.

- [ ] **Step 6: Write the failing session tests on the app side**

```ts
import * as SecureStore from "expo-secure-store";
import { getToken, signIn, signOut } from "./session";

jest.mock("expo-secure-store");

describe("the session", () => {
  beforeEach(() => jest.resetAllMocks());

  it("stores the token that sign-in returns", async () => {
    global.fetch = jest.fn(() => json({ token: "t", user: { id: "1" } }));

    await signIn("a@b.test", "pw");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      "t"
    );
  });

  it("stores nothing when sign-in fails", async () => {
    global.fetch = jest.fn(() => json({ errors: [{ message: "x" }] }, 401));

    await expect(signIn("a@b.test", "pw")).rejects.toBeInstanceOf(ApiError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("sends the stored token on an authenticated request", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() => json({ user: { id: "1" } }));

    await payloadFetch("/users/me", { auth: true });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];

    expect(new Headers(init.headers).get("Authorization")).toBe("JWT t");
  });

  it("clears the token on a 401 rather than retrying for ever", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("stale");
    global.fetch = jest.fn(() => json({ errors: [{ message: "x" }] }, 401));

    await expect(payloadFetch("/users/me", { auth: true })).rejects.toThrow();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("revokes server-side on sign-out, not only locally", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() => json({ message: "ok" }));

    await signOut();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/logout"),
      expect.objectContaining({ method: "POST" })
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("clears the token even when the logout request fails", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() => Promise.reject(new TypeError("offline")));

    await signOut();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("refreshes rather than signing out while the token is still valid", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
    global.fetch = jest.fn(() => json({ refreshedToken: "t2" }));

    await refresh();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      "t2"
    );
  });
});
```

Tests four, five and six are Review Focus items 1 and 2. The fifth is the one
people get wrong in the safe-looking direction: `signOut` that returns early
when the network call fails leaves the person signed in on a device they
asked to be signed out of. The server-side revocation is best effort; the
local clear is not.

- [ ] **Step 7: Implement, including the reinstall case**

`expo-secure-store` items survive app deletion on iOS — the keychain is not
part of the app container. A reinstall therefore resumes a session, including
one whose account has since been deleted, which answers 401 for ever. Handle
it where it is cheap: on first launch, if `AsyncStorage` (which **is** wiped
with the app) has no install marker, clear the stored token before reading
it, then write the marker.

```ts
const INSTALL_MARKER = "smog.install";

/**
 * The keychain outlives the app on iOS; `AsyncStorage` does not. A token
 * with no install marker beside it therefore belongs to a previous
 * installation, and resuming it is how a reinstall lands on a session whose
 * account may not exist any more — 401 on every request, with no signed-out
 * state to recover from.
 */
async function clearStaleInstall(): Promise<void> {
  if ((await AsyncStorage.getItem(INSTALL_MARKER)) !== null) {
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.setItem(INSTALL_MARKER, "1");
}
```

Test it: with no marker and a stored token, `getToken()` resolves `null` and
`deleteItemAsync` was called; with a marker, the token comes back.

- [ ] **Step 8: Build the three screens**

`sign-in.tsx`, `sign-up.tsx` and `forgot-password.tsx`, from
`@smog/ui-native` only. The sign-in screen states the lockout rule to
everybody, the same wording the web sign-in page carries and for the same
reason: it is true for the locked visitor, harmless for the one who
mistyped, and useless to an enumerator because it is shown on every failure.

Sign-up lands on the sign-in screen with the "if that address was free, your
account is ready" notice — **not** signed in. Anything else reintroduces the
oracle the whole shared decision exists to close.

- [ ] **Step 9: Run everything and commit**

```bash
bun -F site test
bun -F mobile test
bun -F mobile check-types
```

```bash
git add apps/site apps/mobile
git commit -m "feat: one sign-up decision, two renderers, and a session that survives a reinstall

Four of the five auth endpoints the app needs already ship on the users
collection. Only sign-up was missing, and it shares its decision function
with the form endpoint so 'created' and 'already registered' are one
value rather than two implementations of one property.

Sign-out clears the token even when revoking it fails, and a keychain
token with no AsyncStorage marker beside it is a previous installation's."
```

---

## Task 9: Google sign-in on a phone

The web flow ends by setting a `httpOnly` session cookie. A native app has no
cookie jar to set it in, so the flow needs one new step and it is the step
where this goes wrong in the field.

**What must not happen: the session token in the redirect URL.** The obvious
implementation — `smog://auth-callback#token=<jwt>` — puts a two-hour session
credential into a URL, which lands in the system browser's history, in the OS
log of the open-URL intent, and, on Android, in **any** app that registered
the same custom scheme. Nothing stops a second app claiming `smog://`.

So the callback hands back a **single-use exchange code with a sixty-second
life**, and the app trades it for the real token over HTTPS. Two mechanisms
this repository already owns do all of the work:

- the code is a **signed JWT**, minted and verified exactly the way
  `endpoints/oauth.ts` already mints and verifies its state cookie — `jose`
  `SignJWT`/`jwtVerify` over `PAYLOAD_SECRET`, with `purpose: "mobile-exchange"`,
  the user id, a `jti`, and `setExpirationTime("60s")`;
- single use is **`takeClaim` on the `jti`**, which is what the claims table
  is for: one row per opaque key, a unique index, an insert that either wins
  or loses. It is the only atomic primitive on this database, and a replayed
  code loses the race by construction rather than by a read-then-write.

The claim's TTL is **five minutes**, deliberately longer than the token's
sixty seconds: a claim row that expired before the code it guards would let
the code be replayed in the window between. A lease and the thing it protects
cannot share an expiry policy — Stage 7 wrote that finding down.

**Still blocked on the same thing Stage 4 was:** there are no Google
credentials in development or CI. `resolveProvider` answers `null` and the
endpoint redirects with `?error=oauth-unavailable`, which keeps the route
table the same shape everywhere. Acceptance here is against the stub provider
Stage 4's `oauth.int.test.ts` already installs. **A fake proves the shape of a
protocol and never the provider's behaviour** — this stage's exit records the
live check as outstanding, exactly as Stage 4's criterion 2 does.

**Files:**
- Modify: `apps/site/src/endpoints/oauth.ts` (the `client` state claim and the native callback branch)
- Create: `apps/site/src/endpoints/mobileSession.ts` + `mobileSession.int.test.ts`
- Modify: `apps/site/src/lib/claims.ts` (`mobileExchange` claim kind)
- Modify: `apps/site/src/collections/Claims.ts` — **nothing**; the `select` options are derived from `CLAIM_KIND_VALUES`
- Modify: `apps/site/src/payload.config.ts`
- Create: `apps/mobile/src/lib/google.ts` + `google.test.ts`
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `takeClaim` from `lib/claims.ts`, `CLAIM_KINDS`, the existing `startHandler`/`callbackHandler` in `endpoints/oauth.ts`.
- Produces:
  - `CLAIM_KINDS.mobileExchange = "mobile-exchange"`.
  - `GET /api/auth/google?client=mobile` — same flow, and the callback redirects to `smog://auth-callback?code=<jwt>` instead of a page.
  - `POST /api/mobile/session`, body `{ code }`, answering `200 { token, user }` or `401 { status: "invalid-code" }`.
  - `mintExchangeCode(payload: Payload, userId: string, options?: { ttl?: string }): Promise<string>`, exported from `endpoints/mobileSession.ts` — the callback calls it and the tests call it. `ttl` is a `jose` duration string defaulting to `"60s"`; the tests pass `"-1s"` for an already-expired code.
  - `signInWithGoogle(): Promise<void>`, `REDIRECT_URI: string` in the app.

- [ ] **Step 1: Write the failing tests for the exchange endpoint**

```ts
describe("POST /api/mobile/session", () => {
  it("exchanges a fresh code for a token", async () => {
    const code = await mintExchangeCode(payload, user.id);
    const response = await post({ code });

    expect(response.status).toBe(200);
    expect((await response.json()).token).toEqual(expect.any(String));
  });

  it("returns a token that actually authenticates", async () => {
    const code = await mintExchangeCode(payload, user.id);
    const { token } = await (await post({ code })).json();

    const me = await fetch(`${BASE}/api/users/me`, {
      headers: { Authorization: `JWT ${token}` },
    });

    expect((await me.json()).user?.id).toBe(user.id);
  });

  it("refuses the same code twice", async () => {
    const code = await mintExchangeCode(payload, user.id);

    expect((await post({ code })).status).toBe(200);
    expect((await post({ code })).status).toBe(401);
  });

  it("refuses a code that has expired", async () => {
    const code = await mintExchangeCode(payload, user.id, { ttl: "-1s" });

    expect((await post({ code })).status).toBe(401);
  });

  it("refuses a code signed with a different secret", async () => {
    const code = await signWith("not-the-secret", { sub: user.id });

    expect((await post({ code })).status).toBe(401);
  });

  it("refuses a session token presented as an exchange code", async () => {
    const { token } = await payload.login({
      collection: "users",
      data: { email: user.email, password: PASSWORD },
    });

    expect((await post({ code: token })).status).toBe(401);
  });

  it("answers the same bytes for every refusal", async () => {
    const expired = await post({ code: await mintExchangeCode(payload, user.id, { ttl: "-1s" }) });
    const forged = await post({ code: await signWith("not-the-secret", { sub: user.id }) });

    expect(await expired.text()).toBe(await forged.text());
  });

  it("survives two concurrent redemptions of one code", async () => {
    const code = await mintExchangeCode(payload, user.id);
    const [a, b] = await Promise.all([post({ code }), post({ code })]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });
});
```

The sixth test is the one that is easy to omit and expensive to omit: without
a `purpose` claim checked on verification, a **session token is a valid
exchange code**, because both are JWTs signed with `PAYLOAD_SECRET`. That
turns a stolen two-hour token into a fresh two-hour token on demand.

The eighth is the property the claims table exists for, and it is written the
same way Stage 5's `survives two concurrent deliveries of the same payment`
is written — which is the test that the `unique: false` mutation fails.

- [ ] **Step 2: Run, implement, run**

```bash
bun -F site test src/endpoints/mobileSession.int.test.ts
```

The handler, in order: verify the JWT with `jwtVerify` (algorithms `["HS256"]`
only — an `alg: none` token is the other way this endpoint gets owned), check
`purpose === "mobile-exchange"`, `takeClaim(payload, { kind: CLAIM_KINDS.mobileExchange, key: jti, ttlMs: 300_000 })`,
and only then issue a session with `loginOperation`'s underlying token minting
— or `payload.login` against the user, whichever Stage 4's `googleStrategy`
already uses for the same job. **Read how `endpoints/oauth.ts` finishes its
own flow and do the same thing**; there must not be two ways of minting a
session in this codebase.

Every refusal returns the same bytes and takes at least `AUTH_FLOOR_MS`.

- [ ] **Step 3: Teach the OAuth callback about a native client**

`startHandler` accepts `?client=mobile` and carries it **inside the signed
state**, not as a query parameter on the callback. The state is already a
signed JWT with a TTL; a `client` claim rides along for free, and putting it
in the URL instead would let anyone turn a web sign-in into a redirect to a
custom scheme.

The callback branches once, at the end: `client === "mobile"` redirects to
`smog://auth-callback?code=<exchange>` and emits **no** session cookie;
anything else is the existing path, byte for byte. Add a test that the web
branch is unchanged — `?client=` absent still sets the cookie and still
redirects to the home page — because that is the regression this branch can
cause.

- [ ] **Step 4: Build the app side**

```ts
import * as WebBrowser from "expo-web-browser";

/**
 * Opens the provider in the **system browser**, not a WebView.
 *
 * A WebView sign-in is an app-controlled window around somebody's Google
 * password, which is why Google refuses it, and it shares no session with
 * the browser the person is already signed into. `openAuthSessionAsync` is
 * ASWebAuthenticationSession on iOS and a Custom Tab on Android — a browser
 * this app cannot read.
 */
export async function signInWithGoogle(): Promise<void> {
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_BASE_URL}/api/auth/google?client=mobile`,
    REDIRECT_URI
  );

  if (result.type !== "success") {
    return;
  }

  const code = new URL(result.url).searchParams.get("code");

  if (code === null) {
    throw new ApiError("oauth", 400);
  }

  const { token } = await payloadFetch<{ token: string }>("/mobile/session", {
    body: JSON.stringify({ code }),
    method: "POST",
  });

  await storeToken(token);
}
```

Tests: a cancelled flow (`result.type === "dismiss"`) stores nothing and
throws nothing; a success with no `code` throws rather than silently
appearing to sign in; a success stores the token the exchange returned and
**not** anything from the URL.

- [ ] **Step 5: Prove the single-use claim is load-bearing**

Set `unique: false` on the claims `key` field, run
`bun -F site test src/endpoints/mobileSession.int.test.ts`, and confirm
"survives two concurrent redemptions" FAILS — along with Stage 5's payment
test and Stage 6's render tests, which is the point: one mechanism, one
mutation, five failures. Restore byte for byte. Paste the output.

Then remove the `purpose` check, re-run, and confirm "refuses a session token
presented as an exchange code" FAILS. Restore. Paste that too.

- [ ] **Step 6: Commit**

```bash
bun -F site test
bun -F mobile test
git add apps/site apps/mobile
git commit -m "feat: Google sign-in on the phone, without the token in the URL

The callback hands back a sixty-second single-use exchange code and the
app trades it over HTTPS. A session token in a custom-scheme redirect is
readable from the browser history, the OS log and any app that claims
the same scheme.

Single use is takeClaim on the code's jti — the unique index is the only
atomic primitive here. The claim outlives the code it guards, because a
lease and the thing it protects cannot share an expiry policy.

Live Google credentials are still outstanding, as in Stage 4."
```

---

## Task 10: Gestures — browse, search, detail, play

The reader half of the app, and the part almost everybody who installs it
will ever use.

**The architectural decision, stated once.** The spec says "Expo app on
Payload REST", and most of this app does exactly that: categories and a
gesture by id are ordinary `GET /api/<collection>` reads with `?locale=` and
`?depth=1`. Two reads are not, and both for the same reason — the web already
owns a rule that a client re-deriving it would own a second, drifting copy of:

- **The list.** `lib/gestureQuery.ts` sorts `["name", "id"]` because `name`
  is localized and optional, so in a locale nothing is translated into every
  row sorts equal and a paginated list shows one gesture twice and another
  never. It also clamps a page past the end and re-queries. Neither is
  expressible as a query string.
- **Search.** `lib/search.ts` runs **two** passes over the search index,
  because Payload's `localization.fallback` applies when a document is read
  and nowhere in the query builder — a French query against a Dutch-only
  entry matches nothing while *reading* that same entry in French happily
  returns its Dutch title. A client doing one `?where[title][contains]=`
  would silently return no results in `en` and `fr`, which are the two
  locales that start empty.

So those two get endpoints that call the shipped helpers. They cost only the
handler: `app/(payload)/api/[...slug]/route.ts` already carries the Payload
graph, and a new `app/**/route.ts` would cost ~519 KiB.

**The rule for the rest of this stage:** an endpoint exists only where
re-deriving the rule in the client would be a second implementation of a rule
the web already has. Everything else is plain REST.

**Files:**
- Create: `apps/site/src/endpoints/mobile.ts` + `mobile.int.test.ts`
- Modify: `apps/site/src/payload.config.ts`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`, `index.tsx`, `search.tsx`
- Create: `apps/mobile/app/gestures/[id].tsx`
- Create: `apps/mobile/src/data/gestures.ts` + `gestures.test.ts`

**Interfaces:**
- Consumes: `fetchGestures`, `fetchCategoryOptions` (`lib/gestureQuery.ts`), `searchGestureIds` (`lib/search.ts`), `fetchGesture` (`lib/gestureDetail.ts`), `GESTURES_PER_PAGE`, `toGestureSummary`.
- Produces:
  - `GET /api/mobile/gestures?locale=&page=&category=&q=` → `{ docs: GestureSummary[]; page: number; totalPages: number; totalDocs: number }`.
  - `GET /api/mobile/categories?locale=` → `{ docs: { id: string; name: string }[] }`.
  - App side: `useGestures(params)`, `useGesture(id)`, `useCategories()` — each returning `{ data, error, loading, refetch }`.

- [ ] **Step 1: Write the failing endpoint tests**

```ts
describe("GET /api/mobile/gestures", () => {
  it("returns active gestures", async () => {
    const body = await get("/api/mobile/gestures?locale=nl");

    expect(body.docs.length).toBeGreaterThan(0);
  });

  it("does not return an inactive gesture", async () => {
    const body = await get("/api/mobile/gestures?locale=nl");

    expect(body.docs.map((d) => d.id)).not.toContain(inactiveGestureId);
  });

  it("answers in the requested locale", async () => {
    const nl = await get("/api/mobile/gestures?locale=nl");
    const fr = await get("/api/mobile/gestures?locale=fr");

    expect(fr.docs[0]?.name).not.toBe(nl.docs[0]?.name);
  });

  it("sorts stably across two identical requests", async () => {
    const a = await get("/api/mobile/gestures?locale=en&page=1");
    const b = await get("/api/mobile/gestures?locale=en&page=1");

    expect(a.docs.map((d) => d.id)).toEqual(b.docs.map((d) => d.id));
  });

  it("never returns the same gesture on two pages", async () => {
    const one = await get("/api/mobile/gestures?locale=en&page=1");
    const two = await get("/api/mobile/gestures?locale=en&page=2");
    const ids = [...one.docs, ...two.docs].map((d) => d.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("clamps a page past the end rather than returning nothing", async () => {
    const body = await get("/api/mobile/gestures?locale=nl&page=9999");

    expect(body.docs.length).toBeGreaterThan(0);
    expect(body.page).toBe(body.totalPages);
  });

  it("finds a Dutch-only gesture from a French query", async () => {
    const body = await get("/api/mobile/gestures?locale=fr&q=hal");

    expect(body.docs.length).toBeGreaterThan(0);
  });

  it("returns no gesture for a query matching nothing", async () => {
    const body = await get("/api/mobile/gestures?locale=nl&q=zzzzzz");

    expect(body.docs).toEqual([]);
  });

  it("needs no session", async () => {
    // No Authorization header anywhere above. This asserts it deliberately:
    // `publicReadActive` is what makes the app usable before sign-in, and a
    // handler that reached for `req.user` would break signed-out browsing
    // without breaking a single test written by someone signed in.
    expect((await fetch(`${BASE}/api/mobile/gestures?locale=nl`)).status).toBe(200);
  });

  it("does not leak an inactive gesture through search either", async () => {
    const body = await get(`/api/mobile/gestures?locale=nl&q=${inactiveName}`);

    expect(body.docs).toEqual([]);
  });
});
```

The fifth and the last are the two worth their cost. Paginating an unstably
sorted list is invisible on page one and wrong on page two; and search is the
enumeration surface `payload.config.ts` already spells out an access override
for, so a client-facing search endpoint that bypasses it undoes that work.

- [ ] **Step 2: Run, implement, run**

The handler is thin by design — read and validate the query parameters, call
`searchGestureIds` when `q` is present, hand the result to `fetchGestures`,
map through `toGestureSummary`. **It contains no rule of its own.** If you
find yourself writing a `where` clause in `endpoints/mobile.ts`, the rule
belongs in `lib/` where the web can see it too.

Reuse `lib/gestureListParams.ts` for parsing rather than parsing again.

```bash
bun -F site test src/endpoints/mobile.int.test.ts
```

- [ ] **Step 3: Write the failing screen tests**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import GesturesScreen from "../../app/(tabs)/index";

const PAGE = {
  docs: [{ id: "1", name: "Hallo", categories: [], playbackId: "abc" }],
  page: 1,
  totalDocs: 1,
  totalPages: 1,
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

describe("the gestures screen", () => {
  it("shows a loading state before the first response", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    render(<GesturesScreen />);

    expect(screen.getByLabelText(/loading/i)).toBeOnTheScreen();
  });

  it("shows the gestures once they arrive", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;
    render(<GesturesScreen />);

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
  });

  it("does not show the loading state once loaded", async () => {
    global.fetch = jest.fn(() => json(PAGE)) as unknown as typeof fetch;
    render(<GesturesScreen />);

    await screen.findByText("Hallo");

    expect(screen.queryByLabelText(/loading/i)).toBeNull();
  });

  it("shows an error with a retry when the request fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;
    render(<GesturesScreen />);

    expect(await screen.findByText(/try again/i)).toBeOnTheScreen();
  });

  it("retries when the retry control is pressed", async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(new TypeError("offline")))
      .mockImplementationOnce(() => json(PAGE));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GesturesScreen />);

    fireEvent.press(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows an empty state, not an error, for a successful empty result", async () => {
    global.fetch = jest.fn(() =>
      json({ docs: [], page: 1, totalDocs: 0, totalPages: 1 })
    ) as unknown as typeof fetch;
    render(<GesturesScreen />);

    expect(await screen.findByText(/no gestures/i)).toBeOnTheScreen();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
});
```

The third and fifth are Review Focus item 3, and the fifth is the half people
skip: an app that shows "something went wrong" for an empty search result
teaches everybody to distrust it. A failure and an empty answer are different
states and both are ordinary.

The sixth exists because of what Stage 6 learned: an absence assertion passes
on a screen that has not rendered yet. Every "shows X" in this file needs a
sibling that proves the screen got as far as rendering at all.

- [ ] **Step 4: Build the screens**

Two tabs — Gestures and Search — plus a detail route. `GestureGrid` over
`@shopify/flash-list`, `SearchBar` wired to the `q` parameter,
`CategoryFilter` in a `Sheet`. The detail screen renders `VideoPlayer` for
`playbackId` and the labelled placeholder for a gesture that has none: a
gesture with no video is an ordinary state in this data set, not an error.

Every read passes `locale: resolveLocale(getLocales().map((l) => l.languageTag))`.

- [ ] **Step 5: Prove two assertions are load-bearing**

Remove `"id"` from the sort in `lib/gestureQuery.ts`, re-run
`bun -F site test`, and confirm the stability and no-duplicates tests FAIL —
**and note which other suites fail with them**, because that sort is the web
list's too. Restore. Then make the error state render for an empty result,
re-run the app tests, confirm the empty-state test FAILS. Restore. Paste both.

- [ ] **Step 6: Commit**

```bash
git add apps/site apps/mobile
git commit -m "feat: browse, search, play — on the shipped rules rather than new ones

Two reads get endpoints because the web already owns their rules: the
list's stable sort and clamp, and search's two-pass locale fallback. A
client re-deriving either would own a second copy that drifts. Everything
else is plain Payload REST.

A failed request and an empty result are different screens. Both are
ordinary."
```

---

## Task 11: Favourites and lists

**Guest state stays on the device.** The user's instruction, and it is also
the simpler system: no guest identity, no server row, nothing to reconcile
until there is an account to reconcile into. `apps/site/src/lib/guestStore.ts`
is the web's version of this and the shape to follow — the same keys, the
same toggle semantics, `AsyncStorage` in place of `localStorage`.

**Files:**
- Create: `apps/mobile/src/lib/guest.ts` + `guest.test.ts`
- Create: `apps/mobile/src/data/favorites.ts`, `lists.ts` + tests
- Create: `apps/mobile/app/(tabs)/lists/_layout.tsx`, `index.tsx`, `[id].tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/gestures/[id].tsx`

**Interfaces:**
- Consumes: `payloadFetch`, `useSession`.
- Produces:
  - `readGuestFavorites(): Promise<string[]>`, `toggleGuestFavorite(id: string): Promise<string[]>`, `clearGuestFavorites(): Promise<void>`, and the constants `GUEST_FAVORITES_KEY` and `MAX_GUEST_FAVORITES` — the names `apps/site/src/lib/guestStore.ts` uses, deliberately, so the two implementations read as one idea. **Read that file for the cap's value**; it is not repeated here.
  - `useFavorites(): { ids: string[]; toggle: (id: string) => Promise<void>; signedIn: boolean }`.
  - `useLists()`, `useList(id)`.
- Endpoints used, all shipped: `POST /account/favorites`, `POST /account/merge-favorites`, and the six flat `POST /account/lists/*` writes — `create`, `rename`, `delete`, `add`, `remove`, `share`. **Read `apps/site/src/endpoints/favorites.ts` and `lists.ts` for each one's exact request body before writing the client**; the shapes in this plan's snippets were reasoned from the endpoint names, not transcribed, and they are the most likely thing here to be wrong.

- [ ] **Step 1: Write the failing guest-store tests**

```ts
describe("guest favourites", () => {
  it("starts empty", async () => {
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("adds an id", async () => {
    await expect(toggleGuestFavorite("a")).resolves.toEqual(["a"]);
  });

  it("removes an id that is already there", async () => {
    await toggleGuestFavorite("a");

    await expect(toggleGuestFavorite("a")).resolves.toEqual([]);
  });

  it("survives a corrupt stored value", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, "{not json");

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("survives a stored value that is not an array of strings", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, '{"a":1}');

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("does not grow without bound", async () => {
    for (let i = 0; i < 600; i += 1) {
      await toggleGuestFavorite(`g${i}`);
    }

    await expect(readGuestFavorites()).resolves.toHaveLength(MAX_GUEST_FAVORITES);
  });
});
```

Tests four and five are the ones that matter, and `lib/guestStore.ts` has
them for the same reason: stored data is **input**, and a `JSON.parse` of
whatever is in storage is a crash on every launch after one bad write. Read
the cap `guestStore.ts` uses and use the same number.

- [ ] **Step 2: Write the failing merge test**

On sign-in, the device's guest favourites are merged into the account with
`POST /account/merge-favorites`, which Stage 3 built and Stage 4 wired.

```ts
it("merges the device's favourites into the account on sign-in", async () => {
  await toggleGuestFavorite("a");
  global.fetch = jest.fn(() => json({ token: "t", user: { id: "1" } }));

  await signIn("a@b.test", "pw");

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/account/merge-favorites"),
    expect.objectContaining({
      body: JSON.stringify({ ids: ["a"] }),
      method: "POST",
    })
  );
  await expect(readGuestFavorites()).resolves.toEqual([]);
});

it("clears the device's copy only after the merge succeeds", async () => {
  mockFetchRejects(new TypeError("offline"));

  await expect(signIn("a@b.test", "pw")).rejects.toThrow();

  await expect(readGuestFavorites()).resolves.toEqual(["a"]);
});

it("does not merge an empty device list", async () => {
  await signIn("a@b.test", "pw");

  expect(fetch).not.toHaveBeenCalledWith(
    expect.stringContaining("merge-favorites"),
    expect.anything()
  );
});
```

The second is the one that loses data when it is missing: clearing before the
merge is confirmed throws away the only copy.

- [ ] **Step 3: Write the failing deactivated-gesture test**

This is Review Focus item 5.

```ts
it("renders a favourites list containing an id that no longer resolves", async () => {
  mockFetchResolves({ docs: [ACTIVE], totalDocs: 1 });   // two ids requested
  render(<FavoritesScreen ids={[ACTIVE.id, "deactivated"]} />);

  expect(await screen.findByText(ACTIVE.name)).toBeOnTheScreen();
  expect(screen.queryByText("undefined")).toBeNull();
});
```

`publicReadActive` makes a deactivated gesture unreadable, so a favourites
screen that assumes every stored id comes back renders a blank row — or, if
it indexes by position, the wrong gesture's name under the wrong id. Filter
to what the API returned and let the stale id fall out.

- [ ] **Step 4: Run, implement, run**

```bash
bun -F mobile test
bun -F mobile check-types
```

Signed-in favourites go through `POST /account/favorites`; signed-out ones
never leave the device. `useFavorites` is the only thing that knows which,
because two call sites making that choice is one call site making it wrong.

The list screens use the six flat `/account/lists/*` endpoints. They are flat
siblings rather than nested paths for a reason `endpoints/lists.ts` records —
overlapping patterns leave Payload's matcher to choose, and the wrong choice
answers "saved" without saving. Do not "tidy" them into `/account/lists/:id`.

`MAX_LIST_ITEMS` is 50 and the server enforces it. The app shows the limit
before the request rather than only reporting the refusal.

- [ ] **Step 5: Prove the merge test is load-bearing**

Move the `clearGuestFavorites()` call above the merge request, re-run,
confirm "clears the device's copy only after the merge succeeds" FAILS.
Restore. Paste it.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): favourites and lists, with guest state that never leaves the device

Stored data is input: a corrupt AsyncStorage value is an empty list, not
a crash on every launch. The device's copy is cleared after the merge is
confirmed, not before, because it is the only copy. A favourited gesture
that has since been deactivated falls out of the list instead of
rendering a blank row."
```

---

## Task 12: Settings and account

The last screens, and the ones with the destructive action on them.

**Files:**
- Create: `apps/mobile/app/(tabs)/settings/_layout.tsx`, `index.tsx`, `account.tsx`
- Create: `apps/mobile/src/lib/i18n.ts` + `i18n.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (theme + i18n providers)

**Interfaces:**
- Consumes: `useSession`, `payloadFetch`, `@smog/i18n`'s `nl`, `en`, `fr` and `availableLocales`.
- Endpoints used, all shipped: `POST /account/password`, `POST /account/email`, `POST /account/delete`.
- Produces: `t(key: string): string`, `setLocale(next: Locale): void`, `useLocale(): { locale: Locale; setLocale: (next: Locale) => void }`. `setLocale` is exported standalone as well as through the hook, because the i18n tests drive it without rendering.

- [ ] **Step 1: Write the failing i18n tests**

```ts
describe("translations", () => {
  it("returns the Dutch string by default", () => {
    expect(t("search.placeholder")).toBe(nl.search.placeholder);
  });

  it("returns the French string when the locale is French", () => {
    setLocale("fr");

    expect(t("search.placeholder")).toBe(fr.search.placeholder);
  });

  it("falls back to Dutch for a key missing in a locale", () => {
    setLocale("fr");

    expect(t("some.key.only.in.nl")).toBe(nl.some?.key?.only?.in?.nl ?? "some.key.only.in.nl");
  });

  it("returns the key itself rather than blank for a key in no locale", () => {
    expect(t("nothing.here")).toBe("nothing.here");
  });

  it("has the same key set in all three locales", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`]
      );

    expect(keys(fr).sort()).toEqual(keys(nl).sort());
    expect(keys(en).sort()).toEqual(keys(nl).sort());
  });
});
```

The fourth is the difference between a missing translation you can see and a
blank label you cannot. The fifth is the one that finds the real bug: a key
added to `nl.json` and forgotten in the other two is invisible until a French
speaker opens that screen.

If the fifth fails today on the shipped `@smog/i18n`, **that is a finding, not
a test to weaken**. Record the missing keys in the task report and either fill
them or list them as a Stage 10 item — do not delete the assertion.

- [ ] **Step 2: Write the failing account tests**

```tsx
describe("delete account", () => {
  it("does not delete on the first press", async () => {
    render(<AccountScreen />);
    fireEvent.press(screen.getByRole("button", { name: /delete my account/i }));

    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/account/delete"),
      expect.anything()
    );
  });

  it("asks for the password before deleting", async () => {
    render(<AccountScreen />);
    fireEvent.press(screen.getByRole("button", { name: /delete my account/i }));

    expect(await screen.findByLabelText(/password/i)).toBeOnTheScreen();
  });

  it("deletes once confirmed", async () => {
    global.fetch = jest.fn(() => json({ message: "ok" }));
    render(<AccountScreen />);

    fireEvent.press(screen.getByRole("button", { name: /delete my account/i }));
    fireEvent.changeText(await screen.findByLabelText(/password/i), "pw");
    fireEvent.press(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/account/delete"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("signs out locally after a successful delete", async () => {
    await deleteAccount("pw");

    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("does not sign out when the delete is refused", async () => {
    mockFetchResolves({ errors: [{ message: "x" }] }, 403);

    await expect(deleteAccount("wrong")).rejects.toThrow();

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
```

The first and last are the pair. A delete that fires on one press is a
one-tap data loss; a client that signs out whether or not the server agreed
tells the person their account is gone when it is not.

`POST /account/delete` already requires the password server-side and pads its
timing — Stage 4 built it that way because a borrowed session would otherwise
be an ~80 ms password oracle. The app asks for the password because the
server demands it, not as its own idea.

- [ ] **Step 3: Run, implement, run**

```bash
bun -F mobile test
bun -F mobile check-types
```

Settings holds: language (three options, written straight to `useLocale`),
theme (system / light / dark, driven through NativeWind's colour scheme),
sign-out, and a link out to the web sponsor flow — which opens in the system
browser and is labelled as leaving the app.

The email-change flow sends a confirmation link that, as of Stage 7, is a
real email. The app says "check your email" and stops there; the link is a
web URL and confirming in a browser is correct.

- [ ] **Step 4: Prove the confirmation is load-bearing**

Make the delete button call `deleteAccount` directly, re-run, confirm "does
not delete on the first press" FAILS. Restore. Paste it.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): settings, and an account screen that cannot delete on one press

The password prompt is the server's requirement, not the app's idea. The
local sign-out happens after the server agrees, never regardless — an app
that reports an account deleted when it was not is worse than one that
reports nothing."
```

---

## Task 13: Exit

**Files:**
- Create: `docs/superpowers/plans/2026-09-21-stage-8-native.md` exit section (this file, appended)
- Modify: `docs/superpowers/specs/2026-09-19-payload-migration-design.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Check every exit criterion, with a measurement rather than a claim**

1. **The app builds.** `bun -F mobile export` succeeds for both platforms. Record the bundle size; it is the only number watching this app.
2. **`bun release:check` passes**, `expo-doctor`'s sandbox failure excepted and confirmed against CI.
3. **`bunx knip --no-progress --no-config-hints` is clean**, and the exemption Task 3 added is gone.
4. **Nothing in `apps/mobile` imports a package Stage 10 deletes** — `src/boundary.test.ts`, with its file-count self-check passing.
5. **Every component in `@smog/ui-native` is rendered by at least one screen.** knip proves it; say so explicitly, because an unused component is a maintenance cost with no user.
6. **The prop vocabulary is identical across platforms** — `vocabulary.test.ts` green in both packages, and the cross-platform mutation from Task 3 Step 12 reproduced here.
7. **The generated native theme matches `tokens`** — Task 2's drift test, re-run after every token change this stage made (there should be none).
8. **`apps/site`'s bundle has not grown materially.** Measure it. The endpoints this stage added ride on the existing route; anything above ~20 KiB gzipped means something pulled a module graph in and needs finding.
9. **Signing in, browsing, searching, favouriting and signing out work on a real device.** Not a simulator alone — `expo-secure-store` on a real keychain is the one thing a simulator does not faithfully reproduce, and Review Focus item 2 lives there.
10. **The site's Stage 4 auth assertions still pass unchanged.** `bun -F site test src/endpoints/auth.int.test.ts` with no edits to that file beyond the additions Task 8 made.

- [ ] **Step 2: Run the concurrency mutation one more time**

Set `unique: false` on `claims.key`, run `bun -F site test`, and record which
tests fail. It should now be Stage 5's payment delivery, Stage 6's four
render tests, **and** Task 9's concurrent redemption. Restore byte for byte
and confirm the count returns. This is the whole-stage version of the check
each task did locally, and it is what proves the new consumer joined the
existing mechanism rather than inventing a parallel one.

- [ ] **Step 3: Write the exit assessment**

Append it to this plan, in the shape Stages 4 through 7 use: every criterion,
met or not, with the measurement; then the things that survived the stage and
belong to a later one; then what is still blocked and on whom.

Carry forward at minimum, unless the stage resolved them:

- **Live Google sign-in is unverified** on both platforms. Stage 4 criterion 2, now with a second client.
- **No app-store release.** The spec's decision table says an app-store release is in the critical path for the full migration; this stage produces a buildable app, not a submitted one. Name what is missing — signing, store listings, review — as Stage 10's problem.
- **`apps/native` is still shipping.** Both apps exist until Stage 10 deletes the old one, and they carry different bundle identifiers so they can.
- **Stage 8.5 is next and gates Stage 9.** `user-consents` is `NOT NULL DEFAULT false`; an import into a table with no defined write path cannot tell "no answer" from "declined" and would record a refusal for every existing user.

- [ ] **Step 4: Update the spec and the plans README**

Mark Stage 8 landed in the stage table, link this plan from
`docs/superpowers/plans/README.md`, and add to the spec's findings section
anything this stage learned that a later stage would otherwise re-learn. The
candidates, if they held:

- the keychain outliving the app container, and what that does to a session;
- a session token being a valid exchange code without a `purpose` claim;
- whichever of the NativeWind gate's failure modes actually bit.

- [ ] **Step 5: Commit and push**

```bash
bun run release:check
git add docs apps packages
git commit -m "docs: close Stage 8 with the measurements"
git push -u origin claude/exciting-cerf-y8jun7
```

---

## Notes for whoever executes this

**The two gates.** Task 1 decides whether this package is NativeWind or
`StyleSheet`, and Task 5 Step 2 decides whether the sheet is
`@gorhom/bottom-sheet` or a `Modal`. Both are decisions with a measurement
attached, not steps to get through. Record what you measured.

**The mutation checks are not optional and they are not ceremony.** Every
task has at least one, and each names the exact edit, the exact expected
failure, and "restore byte for byte". Two of this stage's assertions —
Task 1's gate and Task 6's type-parity test — are *specifically* the kind
that pass vacuously, and the self-checks beside them are there because this
project has shipped three vacuous assertions already and caught all three
this way.

**When the plan and the code disagree, the code is right.** Six of this
plan's interface claims were read out of shipped source on 2026-09-21; the
rest were reasoned from it. Stage 5 found eight plan errors, Stage 6 eight,
Stage 7 around twenty-eight, every one of them found by an implementer
reading the file rather than trusting the plan. Do that again, and report
what you found — the report is how the next plan gets less wrong.
