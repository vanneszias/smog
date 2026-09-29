# Phase 3: Learning features implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestures, categories, search (FTS5 + TS ranking), favorites, lists, share links and guest data import, end to end on the site and the mobile app.

**Architecture:** Four feature packages (`@smog/gestures`, `@smog/favorites`, `@smog/lists`, `@smog/account`, the account one partial: only the import), each with `./schema`, `./contract`, `./server`, `./client` (spec §4.2 and `packages/rpc/README.md`). They are composed in `@smog/api`. Domain components go in both kits, and the screens in both apps compose them.

**Tech stack:** as phase 2, plus `@mux/mux-player-react` (web), `expo-video` (native), `@dnd-kit/*` (web reorder, [dep]), `react-native-reanimated` + `react-native-gesture-handler` drag list (native reorder: `react-native-draggable-flatlist` or `react-native-reorderable-list`, whichever supports RN 0.86/reanimated 4; [dep]), `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (mobile offline cache), `@react-native-community/netinfo` ([dep]).

**Spec:** `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md` §4.2, §5.2, §7, §7.1, §9, §10, §11, §16. Inventory rows L-*, U-* (favorites, lists, sharing, guests): `docs/superpowers/specs/2026-09-29-feature-inventory.md`. Tick their `Done` boxes when shipped.

## Global constraints

- Everything in the phase 1 and phase 2 global constraints still applies. That includes newest versions, the catalog, no `Bun.*` in workerd, tokens-only styling, i18n-only copy, the code style, the commit trailer, and `SMOG_OFFLINE=1 bun run release:check` green before reporting.
- Feature packages live in `packages/features/<name>`, named `@smog/<name>`. Add `packages/features/*` to knip workspaces with the first one. Features never import `@smog/api` or another feature's `./server`.
- Public reads are `publicProcedure`-style procedures from `implementRpc` (no guard). Writes on user data use `requireUser`. Every input is validated with Zod in the contract.
- Unpublished gestures and categories (`published_at IS NULL`) never appear in public procedures.
- Client hooks are platform-neutral. They do not branch on web/native; they take the local store and auth state from `@smog/local-store/react` and `@smog/auth/react` context. **Screens never branch on signed-in vs guest.**
- Analytics calls are not wired yet (phase 4). Leave `// analytics: <event>` markers at the call sites listed in inventory P-rows.
- Copy for new strings goes in `@smog/i18n` in nl, en and fr (parity test).
- Performance: every list query is indexed and paginated or bounded (max 100 per page). Gesture detail and search SSR use at most 3 D1 queries each (batch where possible).

## Review focus

1. Search: accent-insensitive (`cafe` finds `café`), multi-word prefix, the category filter (OR over slugs), the typo tier (`hnd` finds `hond`), no duplicates between tiers, an empty query returns browse order, and FTS special characters (`"`, `*`, `-`, `(`) in the query must not throw.
2. The guest ↔ signed-in switch: a guest's favorites and lists show from the local store; after sign-in the import sheet offers the import and the API data shows; after sign-out the local data (now cleared) is not resurrected.
3. List reorder: a stale client reordering with a missing or extra gesture gets `INVALID_STATE`, not silent corruption. Concurrent adds keep positions dense.
4. Share links: a revoked token 404s immediately, a view token can never edit, an edit token requires sign-in, and a private list (no active share) is unreachable by guessing the id.
5. Legacy URLs: `/gestures/<convexId>` 301s to the slug, and unknown ids 404 without leaking errors.

---

### Task 1: `@smog/gestures` (catalogue, categories, search, related)

**Files:** `packages/features/gestures/src/{schema.ts,contract.ts,ranking.ts,normalize-query.ts,server/{queries.ts,search.ts,catalog-cache.ts,reindex.ts,router.ts},client/{use-gesture.ts,use-gestures.ts,use-categories.ts,use-gesture-search.ts,use-related.ts,use-recent-searches.ts,index.ts}}`, tests under `test/` (Vitest workers) and `src/**/*.test.ts` (`bun test`). Modify `packages/api` (mount `gestures`).

**Interfaces (produces):**
- Schema:
  - `gestureSummarySchema { id, slug, name, playbackId, categories: {slug,name}[] }`
  - `gestureDetailSchema` = summary + `{ description, keywords: string[], sponsor: { name: string, until: number } | null, related?: never }`. When a live or expiring sponsorship exists, `playbackId` is the **sponsored** video's.
  - `categorySchema { slug, name, gestureCount }`
- Contract `gesturesContract`:
  - `list({ category?: string[]; cursor?: string; limit?: 1..100 = 50 }) → { items: GestureSummary[]; nextCursor: string|null }` (name order, keyset cursor on `name,id`)
  - `bySlug({ slug }) → GestureDetail` (`NOT_FOUND`). It resolves a slug first, then `legacy_id`, and returns `{ ...detail, canonicalSlug }` so the web can 301.
  - `search({ q: string (0..100 chars), category?: string[], limit?: 1..50 = 20 }) → { items: (GestureSummary & { score, matchedField, matchType })[]; total: number }`
  - `related({ slug, limit?: 1..20 = 5 }) → GestureSummary[]` (shares ≥ 1 category, ordered by the number of shared categories desc, then name)
  - `categories() → Category[]` (published, `sort_order` then name, `gestureCount` of published gestures)
  - `sitemap() → { slug, updatedAt }[]` (all published)
- Pure:
  - `rankGestures(candidates: SearchableGesture[], query: string, opts?) → Ranked[]`, following spec §7.1 exactly, with the typo tier as a separate exported function `typoMatches(projection, query, opts)`
  - `buildFtsQuery(q: string): string | null`, which tokenises the normalised text, escapes FTS syntax, and emits `"tok"*` terms joined by AND
- Server:
  - `reindexGesture(db, gestureId): Promise<void>` rebuilds its `gesture_fts` row from name, keywords, category names and description. It is used by admin in phase 5 and by the seed script.
  - `bumpCatalogVersion(kv)`
  - `getCatalogProjection(db, kv)`, isolate-cached and keyed by the KV version
- Client:
  - `useGesture(slug)`, `useGestures({category})` (infinite), `useCategories()`, `useRelated(slug)`
  - `useGestureSearch({ q, category })`: debounced 250 ms, `placeholderData: keepPreviousData`
  - `useRecentSearches()`: always the local store (spec §11) → `{ items, add, clear }`

- [ ] Step 1: Ranking unit tests (`bun test`). Port the case list from `/home/user/ref-master/packages/hooks/src/__tests__/gestureSearchRanking.test.ts` (empty input, case, field matches, ranking order, missing results, typo) to the new weights, and add:
  - `café`/`cafe` equivalence
  - ties sorted by `localeCompare("nl")`
  - typo `hnd` → `hond` at similarity ≥ 0.6
  - no typo tier for queries under 3 chars
  - `buildFtsQuery('"hond" OR -kat*')` does not produce FTS operators
- [ ] Step 2: Service tests (Vitest workers, seeded D1):
  - list pagination
  - category OR filter
  - unpublished items hidden
  - `bySlug` by slug and by legacy id (`canonicalSlug` set)
  - the sponsored playback override when a `live` sponsorship with a `video_playback_id` exists
  - search returns FTS matches ranked
  - the typo tier kicks in with fewer than 5 results
  - `related` ordering
  - `categories` counts
  - `reindexGesture` after a rename makes the new name searchable
- [ ] Step 3: Run the tests (they fail), implement, and run them again (they pass). Update the db seed script to call the same reindex SQL so seeded gestures are searchable (or insert FTS rows in the seed through a shared SQL builder exported from `@smog/gestures/server`).
- [ ] Step 4: `bun -F @smog/gestures test && bun -F @smog/api test`, then `SMOG_OFFLINE=1 bun run release:check`. Commit `feat(gestures): add catalogue, categories, FTS search and related gestures`.

### Task 2: `@smog/favorites`

**Files:** `packages/features/favorites/src/{schema,contract,server/{service,router},client/{use-favorites,index}}.ts`, tests. Modify `packages/api`.

**Interfaces:**
- Contract (all `requireUser`):
  - `ids() → string[]` (gesture ids, newest first)
  - `list({ cursor?, limit? }) → { items: GestureSummary[]; nextCursor }`, where `GestureSummary` comes from `@smog/gestures/schema`
  - `add({ gestureId })`, `remove({ gestureId })` (idempotent; `NOT_FOUND` for unknown or unpublished gestures)
  - `toggle({ gestureId }) → { favorite: boolean }`
- Client:
  - `useFavorites()` returns `{ ids: Set<string>, isFavorite(id), toggle(id), status, items (summaries, via gestures list-by-ids for guests) }`.
  - Signed in, it uses the API with an optimistic update and rollback. Signed out, it uses the local store.
  - It needs a `gestures.byIds({ ids: string[] ≤ 100 }) → GestureSummary[]` procedure. Add that to `@smog/gestures` in this task (its contract, service and test).
- [ ] TDD:
  - service tests: idempotency, cascade on gesture delete (db), unpublished rejected, other users isolated
  - router tests: UNAUTHORIZED without a session
  - client hook tests (`bun test` + happy-dom + a fake RpcProvider/QueryClient): guest mode uses the local store, signed-in mode calls the API with an optimistic flip and rolls back on error
- Commit `feat(favorites): add favorites for accounts and guests`.

### Task 3: `@smog/lists` (lists, items, ordering, share links)

**Files:** `packages/features/lists/src/{schema,contract,server/{service,sharing,router},client/{use-lists,use-list,use-shared-list,index}}.ts`, tests. Modify `packages/api`.

**Interfaces:**
- Owner procedures (`requireUser`):
  - `mine() → ListSummary[]` (`{ id, name, description, itemCount, updatedAt, shares: { view: boolean; edit: boolean } }`)
  - `get({ id }) → ListDetail` (`{ ...summary, items: (GestureSummary & { position })[] }`; `NOT_FOUND` if not the owner)
  - `create({ name 1..80, description? ≤280 })`, `update({ id, name?, description? })`, `delete({ id })`
  - `addItem({ id, gestureId })` (appends; idempotent), `removeItem({ id, gestureId })` (re-densifies the positions)
  - `reorder({ id, gestureIds })` (must be the exact current set, else `INVALID_STATE`)
  - `share.get({ id }) → { view: ShareLink|null; edit: ShareLink|null }` (`ShareLink { token, url, createdAt }`)
  - `share.create({ id, role })` (returns the existing active one or creates it)
  - `share.revoke({ id, role })` (sets `revoked_at`)
- Public procedures:
  - `shared.get({ token }) → { list: { name, description, ownerName }, role: "view"|"edit", items }`. `NOT_FOUND` for an unknown or revoked token.
  - `shared.addItem({ token, gestureId })` and `shared.removeItem(...)` require a user and an edit role; otherwise `FORBIDDEN`.
- URLs: `url = SITE_URL + "/lists/" + token`.
- Client:
  - `useLists()`: API when signed in, local store for guests.
  - `useList(id)`: owner detail plus mutations with optimistic reorder.
  - `useShareLinks(id)`: signed in only; guests get `{ requiresAccount: true }`.
  - `useSharedList(token)`.
- [ ] TDD:
  - service tests: ownership isolation; reorder permutation validation; positions dense after remove; revoke → 404; view token cannot add; edit token without a session → UNAUTHORIZED; share link idempotency; the delete cascade
  - client hook tests: guest and signed-in paths
- Commit `feat(lists): add lists, ordering and share links`.

### Task 4: Guest data import (`@smog/account`, import part)

**Files:** `packages/features/account/src/{schema,contract,server/{import,router},client/{import-guest-data,use-guest-import,index}}.ts`, tests. Modify `packages/api`.

**Interfaces:**
- `account.importGuestData({ favorites: string[] ≤ 1000, lists: { name, description?, gestureIds: string[] ≤ 500 }[] ≤ 50, consent?: { analytics: boolean; decidedAt: number } }) → { favoritesAdded, listsCreated, listsMerged, itemsAdded, skippedUnknownGestures }`.
  - Unknown or unpublished gesture ids are skipped and counted.
  - A same-name list (case-insensitive, trimmed) is merged by appending the missing items in order.
  - Consent is appended as a `consent_event` with source `import`, `policy_version` from `@smog/config/constants` `CONSENT_POLICY_VERSION` (add it, value `"2026-09-29"`).
  - It is idempotent: running it twice adds nothing the second time.
- Client:
  - `importGuestData({ store, client }) → Promise<ImportResult>`. It reads the local store, calls the API, and on success resets `favorites`, `lists` and `consent` in the local store (preferences and recent searches stay).
  - `useGuestImport()` returns `{ pending: { favorites: number; lists: number } | null, accept(), dismiss() }`. It is set when the auth state becomes `signedIn` and the local store has favorites or lists. `dismiss` keeps the local data but hides the prompt for that user id (remembered in local-store preferences under `importDismissedFor`, a schema addition with a migration if needed).
- [ ] TDD:
  - service tests: merge semantics, idempotency, skipped counts, consent row
  - client tests: accept clears only the imported parts, and a failure keeps the local data
- Commit `feat(account): import on-device guest data after sign-in`.

### Task 5: Domain components (ui-web + ui-native)

**Files:**
- `packages/ui-web/src/domain/{gesture-card,gesture-row,gesture-grid,category-chips,video-player,favorite-button,list-picker,share-link,course-banner,search-results,empty-states}.tsx`
- `packages/ui-native/src/domain/...`: the same names with native implementations
- Tests in both kits. Update `API.md`, `/dev/ui` and the native gallery.

**Interfaces** (identical props on both platforms, presentational only, no data fetching):
- `GestureCard { gesture: GestureSummary; favorite?: boolean; onFavoriteToggle?; href?: string (web) / onPress (native); sponsored?: boolean }`
- `GestureRow` (dense list variant, optional drag handle slot)
- `GestureGrid { items; renderItem? }`
- `CategoryChips { categories: {slug,name}[]; selected: string[]; onChange(selected) }`
- `VideoPlayer { playbackId: string; autoPlay?: boolean; loop?: boolean; aspect?: "3:4"|"16:9"; onNearEnd?: () => void (fires once per loop at ≤ 5 s remaining); onEnded? }`
  - Web: `@mux/mux-player-react` with a lazy import.
  - Native: `expo-video`, HLS `https://stream.mux.com/{id}.m3u8`, pausing on blur (take `isFocused` as a prop).
- `FavoriteButton { active; onToggle; size }`: optimistic pop animation, and haptics on native.
- `ListPicker { lists: { id, name, contains: boolean }[]; onToggle(listId); onCreate(name) }`: a Sheet.
- `ShareLink { url; onCopy; onRevoke; role }`
- `CourseBanner { messageIndex: 1..7; courseUrl }`, which renders `gesture.videoComplete.N` with the linked phrase, ported from the old logic: VIDEO_COMPLETE_COUNT = 7, localized link phrases.
- `SearchResults { state: "idle"|"loading"|"empty"|"error"|"results"; items; onRetry }`, using Skeleton, EmptyState and ErrorState.
- [ ] TDD for roles, labels and callbacks. Take screenshots of `/dev/ui` domain sections (light/dark, 390/1280), review them, and fix. Commits `feat(ui-web): add learning domain components` and `feat(ui-native): add learning domain components`.

### Task 6: Site learning pages

**Files:**
- `apps/site/src/routes/{index.tsx,gestures/index.tsx,gestures/$slug.tsx,favorites.tsx,lists/index.tsx,lists/$shareToken.tsx}`
- `src/components/learning/*` (composition only)
- `src/routes/sitemap[.]xml.ts`, `public/robots.txt`
- e2e: `e2e/{search,gesture,favorites,lists}.spec.ts`

**Behaviour:**
- Home: hero with search (submit → `/gestures?q=`), category chips, and a featured row (first 8 from `list`).
- `/gestures`:
  - SSR the first page of results for `q`/`category` (URL-synced, `replace` navigation).
  - Master–detail at ≥ 1024 px: selecting a gesture shows the detail beside the list and updates the URL to `/gestures/$slug`, which is also a full page.
  - Recent searches show when the field is focused and empty.
- `/gestures/$slug`:
  - SSR detail: video, name, category chips (link to `/gestures?category=`), description, keywords, related, sponsor credit, the add-to-list and favorite actions, share/QR in the overflow menu.
  - `head()`: title, description, canonical, og:image (the Mux thumbnail), and JSON-LD `VideoObject`.
  - Legacy id → 301 to the canonical slug. Unknown → 404 page (the kit EmptyState with the "take me home" CTA).
- `/favorites`: works for guests; signed-in users see the server list.
- `/lists`: master–detail with `?id=`, create/rename/delete, dnd-kit reorder (pointer and keyboard; move up/down in the row menu), the share sheet (signed in only; guests get a sign-in prompt).
- `/lists/$shareToken`: the shared view, plus add/remove for signed-in users with an edit token.
- The guest import sheet is mounted in the root layout (it uses `useGuestImport`).
- Sitemap lists every published gesture. Robots disallows `/admin`, `/api/`, `/dev/`, `/account`.

**e2e:**
- Search `hond` (a seeded name) shows results, and the accent-insensitive query works.
- Open detail: the video element is present and the related section renders.
- Guest favorites a gesture → reload → still a favorite → sign up/verify via `/dev/mail.json` → the import sheet → accept → `/favorites` shows it from the server.
- Create a list, add 3 gestures, reorder with the keyboard, share a view link, open it in a new context: view-only, no edit controls.
- The legacy `/gestures/<legacyId>` 301s.

- [ ] Screenshots (light/dark × 390/1280) of home, gestures, gesture detail, favorites, lists and the shared list. Review them and fix. Commit `feat(site): add learning pages`.

### Task 7: Mobile learning screens and offline cache

**Files:**
- `apps/mobile/app/(tabs)/{index,search,favorites,lists/index,lists/[id]}.tsx`, `app/gestures/[slug].tsx`, `app/shared/[token].tsx`, `app/+native-intent.tsx`
- `src/lib/query-persist.ts`
- tests

**Behaviour:**
- The same flows as the site, with native conventions:
  - large titles
  - the Search tab uses the native header search bar on iOS and the kit SearchField on Android
  - category filter in a Sheet
  - the gesture screen as a card: video top, content below, header buttons favorite and add-to-list, share (`https://<site host>/gestures/<slug>`)
  - the screenshot share prompt (`expo-screen-capture`)
  - the CourseBanner after 7 completed videos (a counter in the local store preferences)
- Lists: drag reorder, a share action (signed in), and a sign-in prompt for guests.
- The guest import sheet after sign-in.
- Offline cache: persist the TanStack Query cache (the gestures `list`/`categories`/`bySlug`, favorites `ids`) in AsyncStorage for 24 h (buster = app version), with an OfflineBanner via NetInfo.
- `+native-intent.tsx` maps the paths from spec §10 and never throws (port and adapt `/home/user/ref-cerf/apps/mobile/app/+native-intent.tsx` and its tests to our URL scheme without locale prefixes).
- `unstable_settings.initialRouteName = "(tabs)"`, and `"index"` in the lists stack.

**Tests (Jest):**
- native-intent tables (gestures slug, legacy id, lists token → shared, unknown → `/`, malformed URI → `/`)
- screens render with a mocked RpcProvider in guest and signed-in modes
- the offline persister restores the cache

- [ ] Verification: `bun -F @smog/mobile test && bun -F @smog/mobile export`, then `SMOG_OFFLINE=1 bun run release:check`. Commit `feat(mobile): add learning screens, deep links and offline cache`.
