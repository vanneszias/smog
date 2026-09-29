# Development Guidelines

SMOG is a Bun + Turborepo monorepo: one Cloudflare Worker (`apps/site`, TanStack Start), one Expo app (`apps/mobile`), and everything else in `packages/*`. The design spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; every non-trivial choice is recorded in `docs/DECISIONS.md`.

## Commands

### Root Commands
```bash
bun install                  # Install (hoisted linker, see bunfig.toml)
bun dev                      # Start all dev servers (turbo)
bun run build                # Build all packages
bun run check                # Biome lint + format with auto-fix
bun run check:ci             # Biome in CI mode (no writes)
bun run check-types          # Typecheck all packages (turbo check-types)
bun run test                 # Run all tests (turbo test)
bun run knip                 # Unused files, exports and dependencies
bun run boundaries           # Enforce the package dependency graph
bun run release:check        # Everything CI runs, in order
```

Use `bun run <script>` for scripts whose name clashes with a Bun built-in (`build`, `test`).

### Site (TanStack Start on Cloudflare Workers)
```bash
bun -F @smog/site dev        # Vite dev server with local bindings (port 5173)
bun -F @smog/site build      # Build (env.dev; deploy builds set CLOUDFLARE_ENV=staging|production)
bun -F @smog/site deploy:dry # Build for staging and validate with wrangler deploy --dry-run
bun -F @smog/site test       # Vitest (Workers pool)
bun -F @smog/site check-types
bun -F @smog/site cf-typegen # Regenerate worker-configuration.d.ts
```

### Mobile (Expo + Expo Router + NativeWind)
```bash
bun -F @smog/mobile dev      # Start Expo dev server
bun -F @smog/mobile ios      # Run iOS simulator
bun -F @smog/mobile android  # Run Android emulator
bun -F @smog/mobile test     # Jest (jest-expo)
bun -F @smog/mobile check-types
```

### Packages
```bash
bun -F @smog/<name> test     # bun test (pure packages) or Vitest (D1/R2/KV/Queues)
bun -F @smog/<name> check-types
```

## Code Style

### Imports
- Third-party imports first, then workspace imports (`@smog/*`), then app-local imports (`@/`)
- Use `@/` alias for app-specific imports
- Use `@smog/package-name` for workspace imports

Example:
```ts
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, SHADOWS } from "@smog/styles";
import { useTheme } from "@/context/ThemeContext";
```

### Naming Conventions
- Components: PascalCase (`GestureCard`, `BottomSheet`)
- Hooks: camelCase with `use` prefix (`useBottomSheet`, `useAutoSync`)
- Services/Instances: camelCase (`gestureService`, `databaseService`)
- Types/Interfaces: PascalCase (`GestureCardProps`, `GestureCardRef`)
- Constants: UPPER_SNAKE_CASE (`BORDER_RADIUS`, `SPACING`)

### TypeScript
- TypeScript 7 (native `tsc`), strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`
- Extend a base from `@smog/config/tsconfig/*.json` (`library`, `react`, `worker`, `react-native`)
- Use `type` keyword for type-only imports: `import type { Gesture } from "@/types"`
- Explicit types for function parameters and return values

### Runtimes
- Code that runs in the Worker (`apps/site`, feature `./server`, jobs, db) never uses `Bun.*`
- Bun is for scripts, tests, the render container and the toolchain
- Env and bindings are validated once per runtime with the schemas in `@smog/config/env/*`

### Error Handling
- Use try/catch in async functions
- Log errors with service name prefix: `[serviceName] Failed to ...`
- Rethrow errors for calling code to handle

Example:
```ts
try {
  await service.doSomething();
} catch (error) {
  console.error("[serviceName] Failed to do something:", error);
  throw error;
}
```

## Project Structure
- `apps/site`: TanStack Start site and API on one Cloudflare Worker (routing, screens, wiring only)
- `apps/mobile`: Expo app (routing, screens, wiring only)
- `packages/*`: shared packages (`config`, `utils`, `db`, `auth`, `rpc`, `api`, `local-store`, `payments`, `video`, `render`, `email`, `jobs`, `analytics`, `i18n`, `styles`, `brand`, `ui-web`, `ui-native`)
- `packages/features/*`: feature packages (`gestures`, `favorites`, `lists`, `account`, `sponsorships`, `admin`) with `./schema`, `./contract`, `./server`, `./client` subpath exports
- `scripts/*`: Bun scripts (boundaries check, release checks, data migration)

Package names are `@smog/<dir>` (`@smog/gestures`, not `@smog/features-gestures`).

## Dependencies
- Allowed dependency directions live in `@smog/config/boundaries` and are enforced by `bun run boundaries`; add a package there before depending on it
- Shared versions go in the root `package.json` `workspaces.catalog` and are referenced as `"catalog:"`
- Use the newest stable version of every dependency; a deviation needs a `docs/DECISIONS.md` entry

## Linting
- Biome handles linting and formatting
- Extends `ultracite` presets (`ultracite/biome/core`, `ultracite/biome/react`)
- Run `bun run check` before committing to auto-fix issues

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
