# Development Guidelines

## Commands

### Root Commands
```bash
bun check                    # Run Biome linter with auto-fix
bun run check:ci             # Run Biome as CI does, without fixing
bun run build                # Build all packages (`bun build` is Bun's bundler, not this)
bun check-types              # Typecheck all packages
bun run test                 # Run every workspace's tests (`bun test` is Bun's runner, not this)
bun dev                      # Start all dev servers (turbo)
bun run release:check        # The full release gate; see "Before pushing"
```

### Site (Payload + Next.js on Cloudflare Workers)
```bash
bun -F site dev              # Start the dev server (port 3003)
bun -F site test             # Run Vitest (unit and integration)
bun -F site test:e2e         # Run the Playwright suite
bun -F site check-types      # Typecheck with tsc
bun -F site generate:types   # Regenerate Cloudflare env and Payload types
bun -F site generate:importmap # Regenerate the admin import map
bun -F site seed             # Seed local staging emulation
```

`deploy:database`, `deploy:app`, `deploy` and `migrate:convex` reach real
infrastructure; run them only as `docs/deployment-checklist.md` and
`docs/cutover-runbook.md` describe.

### Mobile App (Expo/React Native, Payload-backed)
```bash
bun -F mobile dev            # Start Expo dev server
bun -F mobile ios            # Run iOS simulator
bun -F mobile android        # Run Android emulator
bun -F mobile test           # Run Jest tests
bun -F mobile check-types    # Typecheck with tsc
bun -F mobile export         # Production export into dist/
```

### Render (Remotion compositions for Remotion Lambda)
```bash
bun -F render dev:studio     # Start Remotion Studio for visual preview
bun -F render bundle         # Bundle the compositions into build/
bun -F render test           # Run Vitest
bun -F render check-types    # Typecheck with tsc
```

`deploy:function` and `deploy:site:*` deploy to AWS; see `apps/render/README.md`.

### Packages
```bash
bun -F @smog/ui-web test     # Also: @smog/ui-native, @smog/styles
bun -F @smog/ui-web generate:theme # Also: @smog/ui-native
```

## Code Style

### Imports
- Biome sorts imports: package imports (third-party and `@smog/*`) first,
  sorted together, then `@/` app aliases, then relative imports
- Use `@/` alias for app-specific imports
- Use `@smog/package-name` for workspace imports

Example:
```ts
import { Badge, Button, Text } from "@smog/ui-native";
import { router } from "expo-router";
import { useState } from "react";
import { useFavorites } from "@/data/favorites";
```

### Naming Conventions
- Components: PascalCase (`GestureCard`, `SearchBar`)
- Hooks: camelCase with `use` prefix (`useFavorites`, `useLists`)
- Functions and module-level instances: camelCase (`payloadFetch`, `trackEvent`)
- Types/Interfaces: PascalCase (`GestureCardProps`, `OverlayConfig`)
- Constants: UPPER_SNAKE_CASE (`MAX_LIST_ITEMS`, `MAX_GESTURES_PER_SPONSORSHIP`)

### TypeScript
- Strict mode enabled
- Use `type` keyword for type-only imports: `import type { OverlayConfig } from "@smog/types"`
- Explicit types for function parameters and return values

### Error Handling
- Use try/catch in async functions
- Log errors with a module name prefix: `[moduleName] Failed to ...`
- Rethrow errors for calling code to handle

Example:
```ts
try {
  await service.doSomething();
} catch (error) {
  console.error("[moduleName] Failed to do something:", error);
  throw error;
}
```

## Project Structure
- `apps/*`: Application code (site, mobile, render)
- `packages/*`: Shared packages (config, i18n, shared, styles, types, ui-native, ui-web)
- `scripts/*`: The release checks `release:check` runs
- `docs/*`: Operating documentation

## Linting
- Biome handles linting and formatting
- Extends `ultracite` presets
- Run `bun check` before committing to auto-fix issues

## Before pushing
`bun run build` and `bun check-types` are not the gate CI applies. CI runs
`bun run release:check:ci`, which additionally runs Biome, the CI workflow
check, the test suites (the site suite runs in its own `site-tests` job),
`bun audit --production`, `expo-doctor` and an `expo export` of
`apps/mobile`, and **knip**. Knip is the one that catches people out: an
exported symbol nothing imports fails the build, so a helper type exported
"for later" turns the pipeline red on a commit that otherwise passes every
local check.

Run `bun run release:check` before pushing; it is the same gate with the site
suite included. If the whole thing is too slow, at minimum run
`bunx knip --no-progress --no-config-hints` — that is the exact invocation CI
uses, and it is fast.

Note that `expo-doctor` needs network access to the React Native Directory
and a deduplicated `node_modules`, so it can fail locally in a sandbox while
passing in CI's clean install. A local `expo-doctor` failure about duplicate
copies of `react` or an "unexpected server response" is usually the
environment, not the change — confirm against CI rather than chasing it.
