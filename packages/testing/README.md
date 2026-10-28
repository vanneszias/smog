# Automated tests

All tests, fixtures, fakes, runner configuration and test-only tools live in this private workspace. Production packages must not depend on it. There are no new runners: Bun, Cloudflare's Vitest pool, Expo/Jest and Playwright retain their existing jobs.

## Run

From the repository root:

```bash
bun run test                              # all non-browser suites, no cached passes
bun run test:feature lessons               # web, services and native for one feature
bun run test:feature lessons --include-e2e # also the browser coverage
bun run test:feature gestures --list        # inspect exactly what will run
bun -F @smog/lessons test                   # the existing package-focused command
bun packages/testing/runner.ts --runtime native
bun run test:e2e -- --project public        # one of the seven CI shards
```

Runner-specific arguments go after `--`, for example `bun -F @smog/ui-native test -- --runInBand`. Feature runs are a development shortcut, not a release gate: cross-cutting authorization, privacy and repository guards still require the full suite. The browser suite needs a freshly migrated and seeded local D1; the runner never deletes development data. See the root `AGENTS.md` for setup and CI's environment requirements.

## Find and add tests

```text
bun/<feature>/             pure logic, web components and hooks
workers/<feature>/         real D1/KV/R2/queue and full-Worker tests
native/<feature>/          Expo/Jest screens and hooks
e2e/<feature>/             Playwright flows
<runtime>/shared/          cross-cutting and foundational-package coverage
support/<owner>/           fixtures, fakes and harnesses (not test entry points)
config/                   runner, binding and isolated TypeScript configurations
samples/                  invented PDF samples for manual review
```

The existing stateful Maestro stages also moved, to `native/device/<feature>`. Their [device guide](native/device/README.md) retains the required starting states; they are not an unattended CI suite. Existing ignored screenshots/logs in the old app directory are left untouched.

Within a feature, `site`, `mobile` and `service` distinguish execution contexts, not separate feature inventories. Keep support local to its feature when it has one consumer; share only existing, genuinely common setup. The web suites use one happy-dom setup, including cleanup and localStorage isolation. Workers and native tests never load it.

`suites.json` assigns directory roots to an owner and runner. The most-specific root wins, so `bun/gestures/site` belongs to the site, not the gestures package. Add a new feature/platform root to its existing suite; tests added inside a registered root are discovered automatically. Discovery fails on unowned or ambiguous test files. Tests also guard against test files or support imports returning to production trees. Workers suites disable Vitest's disk module replay: a cached workerd socket can strand module loading; the ordinary test and command deadlines remain unchanged.

Worker configurations and the CLI share Node-safe discovery in `suites.ts`. Each Worker suite retains its own binding configuration, migrations and pinned environment. `config/types` keeps native, browser, Bun and each Workers environment separate; `bun run check-types` checks them after production packages generate their binding types. When adding an execution context, update both its suite roots and typecheck inputs. Test-only dependency declarations belong here, even when hoisting would make them work elsewhere.

## Browser isolation

The seven existing projects, retries, accessibility coverage and flaky-pass reporting are unchanged. The three globally mutating serial specs share `e2e/shared/serial`, preserving alphabetical catalogue → languages → maintenance ordering. Feature selection still associates those files with gestures, translation and admin. Reports and traces live under this workspace's ignored `playwright-report` and `test-results` directories; CI uploads both.

Each actual runner invocation passes through `deadline.ts` (25 minutes by default, `SMOG_TEST_DEADLINE_MINUTES` to override). Keep deadlines per E2E shard, not around a whole seven-shard run. `--keep-going` collects failures across non-browser suites; `bun run test:e2e -- --keep-going` does the same across browser shards.

## Maintenance

- Keep assertions at existing public behavior boundaries; source/privacy/security scans are deliberate architectural guards, not generic unit-test patterns to copy.
- Do not remove a test merely because moving it exposed an import or fixture-path error.
- Do not enable cached compatibility forwards without including the central test sources/configuration in their inputs. They intentionally bypass Turbo's package-local test cache. Typechecks also rerun: their binding configurations now live outside the source workspace, and generated binding declarations must exist before the central checks. Turbo explicitly waits for both app checks as well as the package checks.
- Knip's `@smog/migrate-convex` exception preserves the dependency/typecheck graph for tests of private importer modules, which use relative imports rather than its public entry.
- Historical plans and ADRs retain their original paths. This guide and the current root documentation describe the new locations.
