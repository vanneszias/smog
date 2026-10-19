# Phase 7: Render implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid sponsorship gets its real sponsored video. The `render.requested` message starts a `RenderSponsorshipVideo` Workflow per `render_job`. The Workflow:
- gets the gesture's source video from Mux;
- has the `SmogRenderer` Cloudflare Container (Bun + Remotion + Chrome Headless Shell) render the ported `SponsoredVideo` composition;
- uploads the result to Mux (a direct upload with a `render-job:<id>` passthrough);
- waits for the asset through the Mux webhook, then commits it with `completeRender`, which moves the sponsorship to `in_review`.

Any failure after the retries ends in `failRender` (`render_failed` and the admin email). The admin can retry a failed render (A-27), and a watchdog recovers jobs whose message was lost or whose Workflow died. The wizard shows the same composition live in the browser with `@remotion/player` over the gesture's Mux MP4, which replaces the static `SponsorOverlayPreview`.

**The whole pipeline (the Workflow binding and the Container) is built and tested in this phase, but it reaches a deployed environment only once the owner turns it on.** Until then staging keeps `RENDER_MODE=fake`, and its deployed configuration does not change in this phase.

**Architecture:**
- `@smog/render` (`packages/render`) grows from `./contract` into the spec's layout. Its boundaries are unchanged: config, utils, styles, brand.
  - `./contract` (Zod only, client and Worker safe): `renderInputSchema` v1 (unchanged), `RENDER_OVERLAY_LAYOUT`, `SPONSORED_VIDEO_ID`, `RENDER_FPS`, and the Container's HTTP contract (`renderRequestSchema`, `renderResultSchema`, `RENDER_ERROR_CODES`).
  - `./composition` (React + `remotion`, no renderer; source in `src/compositions/`, the spec §8.2 path): `SponsoredVideo`, `SponsorOverlay`, `sponsoredVideoPropsSchema`, `overlayFontSize()`, the font loader.
  - `./metadata` (`mediabunny`): `readSourceMetadata(url)`, which gives the duration in frames and even width and height. It runs in Bun (the Container) and in the browser (the wizard).
  - `./remotion` (the Remotion entry: `registerRoot` + `Root`), only for `@remotion/bundler`.
  - `./testing`: the fake renderer.
  - `src/server/*` (Bun only, **not exported**): the render server (`POST /render`, `GET /health`). It runs with `bun -F @smog/render serve` and in the image built from `packages/render/container/Dockerfile`.
- `@smog/video` gains:
  - master access, the playback-id lookup, the render upload and upload cancel;
  - the static rendition URLs;
  - a render-event hook in `handleMuxWebhook`;
  - the same endpoints in the Mux fake.
- `@smog/sponsorships/server` gains:
  - `runRenderJob(step, deps, params)`: the Workflow's steps as a plain function over a `RenderStep` interface and injected ports. It throws its own `RenderJobFailure`, never `cloudflare:workflows` types, so the D1 logic is tested in the Workers pool without a Workflow.
  - `retryRenderStatements` (A-27), `reconcileRenderJobs` (the watchdog), and the asset deletes of ruling 13.
- `@smog/admin` gains `admin.sponsorships.retryRender` (injected through `AdminDeps.sponsorships`) and its button.
- Site wiring (`apps/site/src/worker/*`):
  - `render-workflow.ts`: `RenderSponsorshipVideo extends WorkflowEntrypoint`, plus the `RenderStep` adapter, which maps a non-retryable `RenderJobFailure` to `NonRetryableError`;
  - `renderer.ts`: `SmogRenderer extends Container` (`@cloudflare/containers`), plus the `RENDER_MODE=local` HTTP client;
  - `render.ts`: the starter switch (`fake` → `fakeRenderStarter`, unchanged; `container`/`local` → `RENDER_WORKFLOW.create`).
  - `src/worker.ts` exports both classes, always.
  - `/api/webhooks/mux` routes `render-job:` events to the Workflow with `sendEvent` when the binding exists.
- **The render gate (ruling 2).** `wrangler.jsonc` holds **no** `workflows`, `containers`, `RENDERER` Durable Object binding or DO migration. `apps/site/render-config.ts` adds them at build time, through the Cloudflare Vite plugin's `config` hook:
  - the `RENDER_WORKFLOW` binding when the env's render mode is `local` (dev only) or `container`;
  - the Container block only for `container`, which also needs `SMOG_RENDER_PIPELINE=1`. That is a GitHub environment variable the owner sets after confirming Workflows and Containers access.
  - `container` without the flag fails the build loudly.
  - `fake` adds nothing, so staging's built config is unchanged.
- Wizard: `apps/site/src/components/sponsor/sponsor-preview.tsx` (`SponsorPreview`) uses `@remotion/player` with `@smog/render/composition`. It is client-only and lazy loaded, with kit controls, and replaces `SponsorOverlayPreview` in the review step and the re-edit page.

**Tech stack:**
- As phase 6. Additions, each newest stable and each a **[dep]** DECISIONS entry. Versions were checked against the registry on 2026-10-04; re-check at install.
  - `remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/layout-utils`, `@remotion/fonts`: 4.0.532. They are pinned exactly, all on one version (Remotion requires it), in the root catalog.
    - `@remotion/bundler` is a devDependency of `@smog/render`: the bundle is built when the image is built.
    - `@remotion/cli`, `@remotion/studio` and `@remotion/media` are not used (ruling 5).
  - `mediabunny` 1.61.1 (`./metadata`; Remotion's own docs use it for duration and dimensions; the old `get-media-metadata.ts` did too).
  - `@fontsource/inter` 5.3.0 (the overlay font file, ruling 6).
  - `@cloudflare/containers` 0.3.7, in the site only.
  - `wrangler` 4.143.0 → 4.147.0, `@cloudflare/vite-plugin` 1.62.0 → 1.62.5, `@cloudflare/vitest-plugin` 1.3.1 → 1.3.6. Bump them in Task 1 and re-run the whole gate.
- Cloudflare Workflows (Miniflare runs them under `vite dev` and the Workers pool, with `introspectWorkflow` / `introspectWorkflowInstance` from `cloudflare:test`) and Cloudflare Containers (a SQLite Durable Object class with a `containers` entry).
- Docker only in CI (the new `render` lane) and, once the gate is on, in the deploy job (`wrangler deploy` builds and pushes the image). The sandbox has the Docker CLI but no daemon.
- `turbo prune @smog/render --docker` builds the image context. This was checked here with turbo 2.11.5: it prunes `bun.lock`, and `bun install --frozen-lockfile` succeeds on its `json/` output (ruling 17).

**Spec:**
- §2 (no `Bun.*` in workerd; Bun in the container), §4 (the `packages/render` layout), §4.1 (boundaries), §5.4 (`render_job`), §5.5 (`rendering → in_review | render_failed`; `render_failed → rendering` by the admin), §8.1 (Workflow `RenderSponsorshipVideo`), §8.2 (whole; amended by rulings 4, 9 and 10), §9 (`/api/webhooks/mux`), §13 (`RENDER_MODE=fake` in e2e; Mux faked at the adapter), §14 (per-env workflow and container), §16 flow 4 (the wizard preview).
- Inventory rows:
  - S-10 (the Player preview), S-17 (the final render), S-25 (the admin reviews the real render), A-27 (render job control and retry), A-15 (its retry button), S-24 (retry render), W-02 (the render passthroughs)
  - Bug list items 29 (no orphan preview assets) and 24 (the "5 sec" overlay card matches the video by construction)
- Tick their `Done` boxes when shipped. S-17 and S-25 are ticked "built; deployed once the owner turns the pipeline on" (Task 9).

**Mandatory carries from `docs/PROGRESS.md` ("Carries into phase 7", point by point):**
1. The starter switch: `apps/site/src/worker/render.ts`. `container`/`local` call `RENDER_WORKFLOW.create({ id: job.workflowInstanceId, params: { renderJobId } })`. (Task 6)
2. The `RENDER_WORKFLOW` binding (per env) and its class, added together, plus the provisioning and `release-config-check` updates. **Gated (ruling 2):** the class is exported from Task 2 on, and the binding is added by the build only for `local`/`container`. (Tasks 2, 6)
3. `markRenderRunning`, `completeRender` and `failRender` from the Workflow. (Task 6)
4. A-27: `admin.sponsorships.retryRender` and its button, with the `render_retried` transition and the `sponsorship.retry_render` audit action and data schema. (Task 7)
5. `render-job:<id>` Mux passthroughs routed to the Workflow (W-02). (Task 5 for the hook, Task 6 for the wiring)
6. The logo header. **Closed by ruling 10 without the header:** the Workflow runs in the site Worker and reads `MEDIA` directly. (Task 6; DECISIONS entry)
7. The Remotion Player `SponsorPreview` replaces `SponsorOverlayPreview`, and the layout constants stay in `@smog/render/contract` (S-10). (Task 8)
8. Staging `RENDER_MODE` `fake → container`. **Gated (ruling 2):** the code, the gate and the switch ship in this phase. The flip is an owner item, since it needs Workflows and Containers on the account and the token. Until then staging stays `fake`, and the admin's "fake render (no overlay)" label still applies to staging's videos. (Tasks 2, 9)
9. From the phase 6 task 5 review:
   - (1) `queued` render jobs whose `render.requested` was lost are re-requested, and Workflows that died are reconciled: the watchdog, ruling 12. This works in `fake` mode too. (Task 7)
   - (2) Separate Mux environments per deploy env stays a phase 8 carry. It matters more now, because every real render creates assets. (Task 9 restates it in PROGRESS.)

## Rulings made for this plan

These are recorded here and go into `docs/DECISIONS.md` with the task that implements them.

1. **Package seams.**
   - The composition, its props schema, the font and the overlay math live in `@smog/render/composition`. The render server, its Dockerfile and the Remotion entry live in `@smog/render` too, outside its exports.
   - Nothing in workerd imports `./composition`, `./metadata` or the server. The deploy guard checks that `dist/server` contains no `@remotion/renderer`, `@remotion/bundler`, `remotion` or `mediabunny` code, and that in `dist/client` `remotion` and `mediabunny` appear only in a lazy chunk, never in an entry chunk.
   - The Workflow's logic is `runRenderJob` in `@smog/sponsorships/server`: it calls `markRenderRunning` / `completeRender` / `failRender` and reads `render_job`. It sees the outside world only through ports:
     - `RenderStep`: `do(name, config, fn)`, `sleep(name, duration)` and `waitForEvent(name, { type, timeout })`, every config explicit (ruling 4);
     - `mux: Mux | null` (`@smog/video`);
     - `readLogo(key) → { bytes, contentType } | null`;
     - `renderer: RendererPort | null`;
     - `queues` (`enqueueOutputs`);
     - `clock`.
   - It signals failure with `RenderJobFailure { code, retryable, message }`. The site's `RenderStep` adapter rethrows a non-retryable one as `cloudflare:workflows` `NonRetryableError`, so `@smog/sponsorships` never imports a Workers module.
   - The `WorkflowEntrypoint` and `Container` subclasses are site wiring (`apps/site/src/worker/*`, spec §4.1 circularity note). `@smog/jobs` keeps the `RenderStarter` interface and gains no Workflow code. The spec's "jobs: … workflows" layout line is amended in DECISIONS: the Workflow is wiring, and its logic is a feature service.
   - The Container's HTTP contract (`renderRequestSchema`, `renderResultSchema`) is in `./contract`. The Worker (which sends) and the Bun server (which receives) validate the same Zod schema.
   - Boundaries: `@smog/render/testing` joins the feature packages' allowed list, as `@smog/analytics/testing` did, so the sponsorships tests may use the fake renderer. `bun run boundaries` scans tests too.
2. **The render gate: the Workflow and the Container reach an env only when the owner turns them on.**
   - Why the gate exists:
     - Every push to `develop` deploys staging. A `workflows` binding makes `wrangler deploy` register the Workflow (`PUT /accounts/:id/workflows/:name`) **after** the script upload. If the staging token lacks that permission, the deploy fails half done.
     - A `containers` entry needs Docker in the deploy job, Containers on the account and a token that may push to the Cloudflare Registry.
     - None of this is confirmed, and a red staging deploy is not acceptable.
   - `wrangler.jsonc` contains none of `workflows`, `containers`, the `RENDERER` DO binding or a DO migration. `RENDER_MODE` stays `fake` in dev and staging and `container` in production.
   - `apps/site/render-config.ts` exports two pure, tested functions, and `vite.config.ts` calls the second from the Cloudflare plugin's `config` hook:
     - `renderBindings(env)` returns the `workflows` entry (`{ name: "smog-<env>-render", binding: "RENDER_WORKFLOW", class_name: "RenderSponsorshipVideo" }`) and the container block (B-1). The block is:
       - `containers: [{ name: "smog-<env>-renderer", class_name: "SmogRenderer", image: <absolute path of packages/render/container/Dockerfile>, image_build_context: <absolute repo root>, instance_type, max_instances }]`, with both paths computed from `import.meta.url`;
       - `durable_objects.bindings: [{ name: "RENDERER", class_name: "SmogRenderer" }]`;
       - `migrations: [{ tag: "renderer-v1", new_sqlite_classes: ["SmogRenderer"] }]`.
       - **The legacy `containers[].image` form with `migrations` is chosen.** The newer `images` / `scheduling_policy` form needs the declarative `exports` map, which is mutually exclusive with `migrations`. Record it.
     - `applyRenderGate({ env, renderMode, flag })`:
       - `fake`: nothing is added.
       - `local`: only allowed in dev (otherwise an error). It adds `RENDER_WORKFLOW`.
       - `container` with `SMOG_RENDER_PIPELINE=1`: it adds `RENDER_WORKFLOW` and the container block.
       - `container` without the flag: **the build fails** with `[render] RENDER_MODE=container needs SMOG_RENDER_PIPELINE=1 (Workflows and Containers access confirmed; see PROGRESS owner actions)`. Nothing is silently downgraded.
   - **Paths are absolute** because the plugin applies the hook's result after it has resolved the file's container paths (`customizeWorkerConfig` → `defu`). A relative `image` would land verbatim in `dist/server/wrangler.json`, and `wrangler deploy` would resolve it against `dist/server/`.
   - The deploy guard asserts on the built `dist/server/wrangler.json`:
     - every `containers[].image` and `image_build_context` is absolute and exists;
     - `RENDER_MODE=container` ⇔ the container block and `RENDERER` are present;
     - `RENDER_MODE` `fake` ⇔ no `workflows`/`containers`.
   - **Dev's local mode.** `.dev.vars` overrides vars at runtime, too late for the build hook. So local mode is chosen when `vite dev` starts: `SMOG_DEV_RENDER_MODE=local bun dev`. The hook sets `vars.RENDER_MODE` and adds the binding, following the `SMOG_DEV_MUX_API_URL` precedent. A `.dev.vars` `RENDER_MODE=local` without it reaches a Worker with no binding, and jobs fail with `workflowUnavailable` (ruling 11), which the dev docs say.
   - `deploy.yml` passes `SMOG_RENDER_PIPELINE: ${{ vars.SMOG_RENDER_PIPELINE }}` (a GitHub **environment** variable, so `staging` and `production` each have their own; absent today) to the ensure step and the deploy step.
   - `scripts/ensure-cloudflare-resources.ts`, **only when the env's mode is `container` and the flag is on**, checks before the deploy:
     - `wrangler workflows list` (read only), which proves the token reaches Workflows;
     - `docker info` succeeds;
     - `wrangler containers list` succeeds, which proves Containers are reachable. Registry push is proven only by the first real deploy, which is an owner item.
     - A refusal prints a `[provision] Workflows: …` or `[provision] Containers: …` line naming what is missing. Nothing is created: Workflows and Containers are created by the deploy itself.
     - With the gate off, it runs nothing new.
   - `release-config-check` asserts:
     - `wrangler.jsonc` has no `workflows`/`containers`/`durable_objects`/`migrations` key (they come only from the gate);
     - `deploy.yml` passes `SMOG_RENDER_PIPELINE` to both steps;
     - `src/worker.ts` exports `RenderSponsorshipVideo` and `SmogRenderer` (the class exports are permanent: a DO class that was deployed once must stay exported);
     - an env whose mode is `container` lists the Mux trio in its required config (ruling 11);
     - the four CI lanes exist (ruling 16).
   - **Turning the flag off again** after a deploy with it leaves the container application idle. It does not delete the class, because no migration is sent and the class stays exported. Deleting it would need a `deleted_classes` migration. `render-config.ts` and PROGRESS say so.
   - **The owner's flip, in order:**
     1. Confirm that the staging token can deploy Workflows and Containers and push images (owner action 1).
     2. Set the `staging` environment variable `SMOG_RENDER_PIPELINE=1`.
     3. Change staging's `RENDER_MODE` to `container`.
     - The other order fails the build on purpose, before anything is uploaded.
3. **Container shape.**
   - `SmogRenderer extends Container` with `defaultPort = 8080`, `sleepAfter = "10m"` (in-flight requests keep it awake), `enableInternet = true` (the Mux source and upload are on the internet) and `envVars` from the Worker: `REMOTION_LICENSE_KEY` when set, and `RENDER_ENVIRONMENT`.
   - One instance per job: `getContainer(env.RENDERER, renderJobId)`.
   - `instance_type: "standard-2"` (1 vCPU, 6 GiB, 12 GB); `renderMedia` runs with `concurrency: 1`. Task 4 records the CI render time of the longest gesture clip, scaled to 1 vCPU. If that approaches 10 minutes (half the step timeout), it switches to `standard-3` and updates owner action 5.
   - `max_instances`: 2 in staging, 4 in production. A capacity refusal is a retryable error of the `render` step.
   - The image is `linux/amd64`, the only architecture Containers run.
   - The server is reachable only through the DO binding (no public route), so it needs no API key. `serve` for local mode binds `127.0.0.1` only.
4. **The Workflow `RenderSponsorshipVideo` (amends spec §8.2.3.2–.7; params `{ renderJobId }`; instance id = `render_job.workflow_instance_id` = the job id).**
   - Every step has an explicit config in `RENDER_STEP_CONFIG`, a named constant shared by the class and the tests. The engine default (5 retries) is never relied on, and the fake step mirrors exactly the configs given. Step names are deterministic.
   - The steps, in order:
     1. `start` (retries 3, 5 s):
        - `markRenderRunning` returns `"started" | "already-running" | "final" | "missing"`.
        - `already-running` continues: the instance id is the job id, so only this instance can be running it. That makes a replayed `start` safe, whether its write committed or not (B-2).
        - `final`/`missing` end the instance with `{ outcome: "noop" }`.
        - It returns the validated job input, the sponsorship id, the gesture's own asset id and the sponsorship's **current (previous) `video_asset_id`**. That is read here, so a replayed `commit` cannot lose it (B-3).
     2. `source-lookup` (retries 3, 10 s exponential):
        - Without Mux (`mux === null`) it fails with `muxUnavailable` (non-retryable).
        - `GET /video/v1/playback-ids/{sourcePlaybackId}` gives the asset id. This replaces the old code's paging through the asset list.
        - `PUT /video/v1/assets/{id}/master-access { master_access: "temporary" }` runs unless master access is already on.
        - It returns `{ assetId | null }`.
     3. `source-poll-1` … `source-poll-30`, each `step.sleep("source-wait-<n>", "10 seconds")` + `step.do` (retries 2) of `masterState`, until `ready`. `errored` ends the polls.
     4. `source-resolve` (retries 3):
        - Master `ready` → `{ kind: "master", assetId }`.
        - Otherwise (no asset in this Mux env, an `errored` master, or 30 polls without `ready`) the public static rendition: `https://stream.mux.com/{id}/highest.mp4`, then `/high.mp4`, whichever answers a `HEAD` with 200 → `{ kind: "rendition", url }`. Rendition URLs are public, not signed.
        - Neither → `sourceUnavailable` (non-retryable).
        - **No signed URL is ever a step output (I-3).** The master URL is re-read inside `render`. A test scans every step output of a full run for `mux.com` URLs with a `token`/signature parameter.
     5. `logo` (retries 3): when `input.logoKey` is set, `MEDIA.get(key)` is checked (≤ 2 MiB, PNG/JPEG/WebP by magic bytes, the checkout's own check). A missing or invalid object is `logoMissing` (non-retryable). It returns only `{ bytes, sha256 }`; the bytes are re-read inside `render`.
     6. `render` (retries 2, `delay: "1 minute"`, exponential, `timeout: "20 minutes"`, spec §8.2):
        1. Without `RENDERER` (`container`) or a reachable local URL (`local`): `rendererUnavailable` (non-retryable).
        2. Cancel the job's previous upload when `render_job.mux_upload_id` is set (`PUT /uploads/{id}/cancel`; an upload that already finished is ignored).
        3. Create a new direct upload: passthrough `render-job:<id>`, public playback, `test: true` in dev only, no `cors_origin` (the PUT is server side), and no `master_access` (the old `uploadToMux` set both; parity note). Store its id in `render_job.mux_upload_id`.
        4. Resolve the source URL (re-reading `masterState` for a master source).
        5. `POST /render` to the renderer with `{ v: 1, renderJobId, input, sourceUrl, logoDataUrl, uploadUrl }`.
        6. Return `{ uploadId, frames, width, height }`.
        - **The spec's separate `upload` step is folded into `render`, a deviation recorded in DECISIONS.** A retried render must not PUT to an upload URL an earlier attempt may already have filled, so each attempt gets a fresh upload and the stale one is cancelled.
        - A `4xx` result (`invalidInput`, `sourceUnreadable`, `logoUnreadable`) is non-retryable. A `5xx`, a network error, a capacity refusal or the timeout is retried.
        - A retry reaches the same container, and the server replaces the job's running render (ruling 7), so a retry after a lost response is never blocked.
     7. `ready-<uploadId>`: `step.waitForEvent("ready-<uploadId>", { type: "mux-asset-<uploadId>", timeout: "1 hour" })`.
        - **The event type is per upload (I-4):** the webhook sends `mux-asset-<uploadId>`, so an event from a superseded upload can never satisfy this wait, and no loop of waits is needed. Mux upload ids are alphanumeric. Task 6 checks the runtime's event-type charset and length limit and records it; if an id could exceed it, the type is `mux-asset-<sha256(uploadId)[0..32]>`.
        - Workflows buffer an event sent before the wait, and a test proves it (I-5).
        - On timeout: `ready-poll-1` … `ready-poll-15`, each `sleep("ready-wait-<n>", "2 minutes")` + `do` (retries 2) of `getUpload` → `getAsset`.
        - `errored` → `muxAssetErrored` (non-retryable, with Mux's message).
        - It returns `{ assetId, playbackId }` (the first public playback id).
     8. `commit` (retries 3):
        - `completeRender(db, { renderJobId, playbackId, assetId, now })`.
        - On `completed`: best effort, it deletes the previous sponsored asset read in `start` when it is set, differs from the new one and from the gesture's own.
        - On `noop`, read the job. When its stored `mux_asset_id` is not the new asset (the sponsorship left `rendering`, or the watchdog failed the job first), it deletes the **new** asset (B-3), so the render leaves nothing behind.
        - A replayed `commit` after a successful one finds `succeeded` with the same asset and deletes nothing.
   - **Failure path:**
     - `run` catches the error that escapes a step after its retries, then runs `step.do("fail", { retries 3 })`:
       - `failRender(db, { renderJobId, error: summary ≤ 300, siteUrl })`;
       - `enqueueOutputs` of its emails (keyed, so a replay sends nothing new);
       - cancel the upload when one exists.
     - The instance then **completes** with `{ outcome: "failed", code }`; it does not rethrow. The job carries the failure, and an `errored` instance is left to infrastructure faults, which the watchdog picks up.
     - `summariseRenderError()` strips every URL (signed master and upload URLs), and a test pins it.
   - **The longest straight path** is `start` + `source` (about 6 min of polls) + `render` (3 × 20 min + 1 + 2 min delays) + `ready` (1 h + 15 × 2 min) + `commit` ≈ 2 h 40 min. `RENDER_WATCHDOG_CEILING` is derived from `RENDER_STEP_CONFIG` (sum + 30 min margin), and a test asserts ceiling > sum.
   - **The starter.** `workflowRenderStarter(binding)`:
     - treats the "instance already exists" error of `create` as started (the exact error is recorded from the installed runtime);
     - **rethrows any other error**, so the `render.requested` message retries;
     - without a binding (`local`/`container` with no `RENDER_WORKFLOW`), fails the job at once with `workflowUnavailable` through `failRender`, so nothing stays `queued`.
5. **The composition (a port of the old `apps/remotion` `SponsoredVideo`, parity).**
   - `SponsoredVideo({ background, logoUrl, displayName, durationInFrames, width, height })`:
     - an `AbsoluteFill` on black;
     - the background `cover`-fitted. While rendering (`useRemotionEnvironment().isRendering`) it is `OffthreadVideo`: frame-accurate, and it fetches the source server side, so the render does not depend on Mux's CORS headers. In the Player it is `Html5Video`.
     - The old code used `@remotion/media`'s `Video`, which works but adds a WebCodecs path in both places for no gain here (recorded; not claimed to fail).
     - `background` may instead be `{ kind: "image", src }`, the Player's fallback (ruling 8). The render never uses it.
   - `SponsorOverlay` is the old code with `RENDER_OVERLAY_LAYOUT`:
     - `startFrame = durationInFrames − overlaySeconds × fps`, negative for clips shorter than 5 s, so the overlay is then there from the start;
     - `spring({ damping: 200, durationInFrames: fadeInSeconds × fps, frame: frame − startFrame })` for the opacity, and `translateY` from `slideUpPx` to 0 on the whole overlay;
     - before `startFrame` nothing renders.
     - The logo is `Img` with `objectFit: contain` in a box `size × width` by `size × height`, centred on (`centerX × width`, `centerY × height`).
     - Text line 1 (`intro`) has its **top** at `y × height`. Line 2 (the display name) is at `y × height + 1.2 × fontSize + 0.3 × fontSize`. Both are horizontally centred, `nowrap`, weight 600, in `text.color`, with an explicit `lineHeight: 1.2`. The old divs had `line-height: normal`, and pinning it keeps the glyph tops stable across fonts (recorded in the parity walk).
     - **The contract's comment "the text is centred at `y`" is wrong against the old code and is corrected.** The phase 6 CSS still centred it, and that component is deleted.
   - **[improvement] Long names fit.** The old overlay clipped a 35-character name off both edges (3.8 % of the height at 9:16 is about 73 px; 35 Inter characters at that size are about 1,450 px on a 1,080 px frame).
     - `overlayFontSize({ width, height, intro, displayName, measure })` returns `min(text.fontSize × height, size that fits the widest line in 90 % of width)`.
     - Measuring uses `@remotion/layout-utils` `measureText` in the overlay font, called **only after the font has loaded** (`validateFontIsLoaded: true`). Otherwise the fallback font's widths would be cached.
     - Both lines use the same size. Short names keep the old size exactly.
     - It is a pure function with a `measure` port.
   - Size and duration come from the source, not from `calculateMetadata`. The caller passes `durationInFrames`, `width` and `height` from `readSourceMetadata`; the server reads it in Bun and the Player in the browser. The Root's `calculateMetadata` only returns those props.
     - `durationInFrames = max(1, ceil(duration × 30))`.
     - Width and height are rounded **down to even** (H.264 needs even sizes; the old code did not round).
     - A source without a video track is `sourceUnreadable`.
   - `<Composition>` gets **no `schema` prop**. Remotion 4.0.532 accepts Zod 4 there, but Studio is not used, and props are validated with `sponsoredVideoPropsSchema` (Zod 4) by the server before `selectComposition` and by `SponsorPreview` before mounting.
6. **The font.**
   - The old overlay used `system-ui, sans-serif`, which in its Debian-slim image resolved to DejaVu and in browsers to the OS font. Now both the render and the preview use one file: Inter 600 latin + latin-ext from `@fontsource/inter`.
   - `./composition` imports it as an asset URL. Task 1 proves that Vite and Remotion's webpack both turn the `.woff2` import into a URL.
   - It is loaded with `@remotion/fonts` `loadFont({ family: "SMOG Overlay", url, weight: "600" })` before the first frame, under `delayRender` in the render, before the Player mounts.
   - Inter is the site's UI font and OFL-1.1 licensed. **[parity change]** recorded: the glyphs differ from the old DejaVu output, but the size, weight, colour and position are the old ones.
7. **The render server (`packages/render/src/server/*`, Bun).**
   - `Bun.serve` on `PORT` (8080 in the image, 3002 for `serve`) with three routes:
     - `GET /health` → `{ ok, version, browser }`;
     - `POST /render`;
     - `GET /assets/<renderJobId>/logo`, which serves the current job's decoded logo to its own render, on `127.0.0.1` only.
   - The env is validated with the new `@smog/config/env/render` (`renderServerEnvSchema`: `PORT`, `RENDER_TMP_DIR`, `RENDER_BUNDLE_DIR`, `REMOTION_LICENSE_KEY?`, `RENDER_BROWSER_EXECUTABLE?`, and `RENDER_ALLOW_HTTP` for dev only).
   - **One slot, keyed by `renderJobId` (I-2).**
     - A new request for the **same** job aborts the running render with `makeCancelSignal()` from `@remotion/renderer`, deletes its temp files and starts again with the new upload URL. A Workflow retry after a lost response is therefore never `busy`.
     - A request for a **different** job while one runs is `503 busy` (retryable). With one instance per job that should not happen, so it is logged as an anomaly.
   - Request handling, in order:
     1. Validate the body (`renderRequestSchema`, ≤ 4 MiB; the logo data URL is ≤ 2 MiB of bytes).
     2. Check the URLs. They must be `https:` unless `RENDER_ALLOW_HTTP`. The upload URL's host must be a `*.mux.com` host unless `RENDER_ALLOW_HTTP`: the same rule as `isAllowedUploadUrl`, re-implemented because `render` may not import `video`.
     3. Write the decoded logo to a temp file served at `/assets/<id>/logo`. The composition's `logoUrl` is that `http://127.0.0.1:<port>/…` URL, not a 2.7 MB base64 input prop (Minor 10).
     4. Read the metadata with `readSourceMetadata(sourceUrl)`.
     5. Render with `selectComposition` + `renderMedia`, using `codec: "h264"`, `imageFormat: "jpeg"` (the old `remotion.config.ts`), `concurrency: 1`, `chromiumOptions.enableMultiProcessOnLinux: true` (Remotion's Docker guidance), `licenseKey` when set, `cancelSignal`, and `serveUrl` = the bundle directory built into the image.
     6. Stream-`PUT` the file to `uploadUrl` with `Content-Type: video/mp4` and `Content-Length`.
     7. Delete the temp files in `finally`.
     8. Answer `200 { ok: true, frames, width, height, bytes, ms }`, or `4xx/5xx { ok: false, code, message }` (`RENDER_ERROR_CODES`).
   - The bundle is made **when the image is built** (`bun src/server/bundle.ts` → `RENDER_BUNDLE_DIR`), never at request time as the old server did.
   - Logs use the `[render]` prefix and never print URLs.
   - `SIGTERM` lets a running render finish within the platform's grace period, then exits.
8. **The wizard preview (`SponsorPreview`, S-10).**
   - The review step shows **one Player at a time**, not one per gesture: up to 10 MP4s at once is too heavy.
     - The selected gestures are a row of poster buttons (`aria-pressed`, the Mux thumbnail, the gesture name).
     - The Player above them shows the chosen one, the first by default.
     - The re-edit page has one gesture and one Player.
   - Its source is `https://stream.mux.com/{playbackId}/highest.mp4`, then `/high.mp4`. `media-src` and `connect-src` already allow `*.mux.com` (`worker/headers.ts`), and the CSP e2e proves it.
   - Its metadata comes from `readSourceMetadata` in the browser.
   - **Fallback:** when neither MP4 loads, the same composition runs with `background: { kind: "image", src: muxThumbnailUrl(playbackId) }` for a fixed 6 s, so the overlay is still exact, with a note that the full video appears after payment. Assets uploaded by the old system have no static renditions (its upload code never set them), so migrated gestures take this path until phase 8 enables renditions.
   - The logo is the local object URL (`useObjectUrl`, unchanged).
   - It loads paused on the last frame (`initialFrame = durationInFrames − 1`), so the result shows at once and nothing autoplays. Play replays from the start.
   - **Kit controls, not Remotion's** (`controls={false}`): a kit `Button` play/pause and "Show the ending" (seek to the overlay start), with copy in `sponsor.preview.*` (nl/en/fr). Remotion's built-in controls carry English tooltips.
   - `initiallyMuted`. `errorFallback` shows the poster fallback. `acknowledgeRemotionLicense` is set (ruling 14).
   - **Client only (I-6):** `const SponsorPreview = import.meta.env.SSR ? null : lazy(() => import("./sponsor-preview"))`, the `packages/ui-web/src/domain/video-player.tsx` precedent.
     - The server and the first client render show the poster in the same aspect box.
     - `useSourceMetadata` (`mediabunny`) lives inside the lazy module, never in `step-review.tsx`.
     - `SponsorOverlayPreview` and its file are deleted.
   - `RENDER_OVERLAY_LAYOUT.overlaySeconds` stays the source of the "5 sec" value card (bug 24).
9. **Mux webhooks for renders (W-02).**
   - `handleMuxWebhook` gains two hooks:
     - `onRenderEvent?: (event: RenderMuxEvent) => Promise<"sent" | "gone">`. `RenderMuxEvent` is `{ renderJobId, type: "asset.ready" | "asset.errored" | "upload.errored" | "upload.cancelled", uploadId, assetId?, playbackId?, error? }`, derived from a verified event whose passthrough starts with `render-job:`.
     - `isCurrentUpload?: (renderJobId, uploadId) => Promise<boolean>`, which is true only when the job is `queued`/`running` **and** its `mux_upload_id` equals `uploadId` (B-3).
   - An `asset.ready` that is not current (a superseded attempt, or a job already failed) gets its asset deleted (`deleteAsset`, logged and swallowed) and is not forwarded.
   - The site route implements `onRenderEvent` as `RENDER_WORKFLOW.get(id).sendEvent({ type: "mux-asset-<uploadId>", payload })`:
     - Not found, or an instance that is `complete`/`errored`/`terminated`, is `"gone"` (logged, 200).
     - A `sendEvent` failure throws, and the route answers 503 so Mux retries.
     - Without the `RENDER_WORKFLOW` binding (`fake` mode), a render event is logged and answered 200; `fake` creates no render uploads.
   - The per-event KV dedupe (`mux:event:<id>`) applies, and its marker is written only after the hook succeeded.
   - `video.asset.master.ready` is **not** routed. It carries the *source* asset's passthrough (`gesture-upload:…`, or none for pasted or migrated assets), and several jobs can share a source. The `source-poll-<n>` steps poll instead, which is the old behaviour (2 s × 30 then; 10 s × 30 now). Spec §8.2.3.2, W-02's row and DECISIONS line 446 ("…replace polling") are amended or marked superseded.
10. **The logo reaches the renderer from R2 directly (carry 6).**
    - The Workflow class runs in the site Worker, so it has `MEDIA`. It reads `logos/<uuid>` and sends it to the Container as a `data:` URL in the request body.
    - No `x-smog-render` HMAC header and no change to `/api/logos/$key`, which stays admin-only. That is one less authenticated path, and the Container needs no secret.
11. **Secrets, degradation and required config.**
    - **No new secret is required.** `REMOTION_LICENSE_KEY` is optional (ruling 14).
    - New var: `RENDER_LOCAL_URL`, dev only (`workerEnvSchema` refuses it outside dev, the `MOLLIE_API_URL` rule), default `http://127.0.0.1:3002`.
    - `RENDER_MODE=local` is refused outside dev too.
    - `parseWorkerBindings` gains `RENDER_WORKFLOW` and `RENDERER`, both **optional**. The fake path never touches them.
    - Nothing about the pipeline becomes a parse error, which would take the site down. Instead each missing piece fails the job cleanly, with `render_failed` plus the admin email and never a stuck `rendering`:
      - no Workflow binding → `workflowUnavailable` (the starter);
      - no `RENDERER` → `rendererUnavailable`;
      - no Mux token → `muxUnavailable`.
    - The deploy guard makes the first two unreachable in a real deploy (ruling 2).
    - `REQUIRED_WORKER_CONFIG` becomes `requiredWorkerConfig(env, renderMode)`. An env whose mode is `container` needs `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` and `MUX_WEBHOOK_SECRET`; production already lists them, and staging gains them when it flips. `release-config-check` asserts it, and phase 8 checks the values.
12. **The watchdog (carry 9.1).**
    - `reconcileRenderJobs({ db, now, workflow: WorkflowStatusPort | null, queues })` runs in the hourly `runStaleSweep`, after the payment reconciliation, at most 50 jobs per run, oldest first, on the new index.
    - `WorkflowStatusPort` has `status(id) → WorkflowInstanceStatus | "not-found"` and `terminate(id)`.
    - In `fake` mode (no binding) only the first row applies.

    | Job | Instance | Action |
    |---|---|---|
    | `queued` > 10 min | not found, or no binding | re-enqueue `render.requested` |
    | `queued` > 10 min | `complete` / `errored` / `terminated` | `failRender("workflow ended without a result")` |
    | `running` | `errored` / `terminated` | `failRender` with the instance's error summary |
    | `running` | `complete` (commit lost) | `failRender` |
    | `running` | not found | `failRender("workflow not found")` |
    | `running` past `RENDER_WATCHDOG_CEILING` | `queued`/`running`/`waiting`/`paused`/`waitingForPause` | **`terminate()` first, then `failRender("timed out")`** (B-3) |
    | any | `queued`/`running`/`waiting`/`paused`/`waitingForPause` before the ceiling | untouched |
    | any | `unknown` | logged, untouched |

    - Each `failRender` sends its keyed admin emails, so the admin can retry (A-27).
    - It is idempotent (it acts only on `queued`/`running` jobs) and counted (`requeued`, `failed`, `timedOut`) in the `[cron] stale {…}` line.
    - **Migration `0011_render_job_status_idx`** (append-only, `db:generate`) adds `render_job_status_updated_idx` on `(status, updated_at)`, with a query-plan test. The `user.welcomed_at` carry takes the next free number; update its PROGRESS note.
13. **Mux asset hygiene (phase 7 scope).** Every real render creates an asset, so none may leak from the pipeline itself:
    - a superseded attempt's asset is deleted by the webhook (ruling 9);
    - a render whose commit finds the job no longer active deletes its new asset (ruling 4.8);
    - a re-render (an admin retry after a later failure, or a resubmission after "request changes") deletes the previous sponsored asset on commit, never the gesture's own;
    - a failed job's upload is cancelled;
    - force expire uses `@smog/video` `deleteAsset`, as the expiry sweep does. That closes the phase 6 cleanup carry.
    - Every delete treats 404 as done and is logged and swallowed on failure.
    - **Not in this phase:** the retention of a `rejected` sponsorship's video. `rejected → changes_requested` has no time bound today, and a purge would be a new retention promise. It moves to phase 8 with the legal sign-off, which also bounds that transition to match.
14. **Remotion licence.** Remotion is free for non-profit organisations and for companies of up to 3 people; larger companies need a company licence.
    - SMOG & Co vzw is a non-profit, which is an **owner confirmation item**.
    - The code passes `licenseKey: REMOTION_LICENSE_KEY` to `renderMedia` when the secret is set, and the Player sets `acknowledgeRemotionLicense`.
    - The DECISIONS entry links Remotion's licence page and records the owner's answer once given.
15. **Determinism of tests and e2e.**
    - `bun run test` never starts Chrome or Docker:
      - the composition math, the props schema, the contract and the server's request handling (with fake ports) are `bun test`;
      - the Workflow logic runs in the Workers pool with a fake `RenderStep`, the Mux fake and the fake renderer.
    - Two introspection tests drive the real class (`introspectWorkflow` on a test-only `RENDER_WORKFLOW` binding in the site's vitest config). Both call `disableSleeps()` and `disableRetryDelays()` and mock `source-lookup`, `source-resolve` and `render` with `mockStepResult`, so the test project needs no Mux:
      1. the happy path with `mockEvent` `mux-asset-<uploadId>`;
      2. the renderer port answers `422 invalidInput` (a `mockStepError` with the non-retryable error): `render` runs once, `fail` runs, the instance is `complete` with `{ outcome: "failed" }`, the job is `failed`, and one email per admin is enqueued.
    - A third test sends the event **before** the wait is reached (during a slow mocked `render`) and sees it delivered.
    - The real render is `bun -F @smog/render test:render`. It runs in the CI `render` lane, and locally when a browser is available (`RENDER_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1194/…`, or Remotion's own download through the proxy).
    - e2e stays `RENDER_MODE=fake`. The wizard's Player is fed by Playwright routing `https://stream.mux.com/**/highest.mp4` to a committed fixture: `packages/render/test/fixtures/source-2s.mp4`, a 2 s 360 × 640 H.264 clip made once with the render server (`bun -F @smog/render fixture`, script committed), about 50 KB. `image.mux.com` goes to the existing fixture poster. No e2e test reaches the internet.
16. **CI: a fourth release lane, `render`.**
    - In CI, `docker/build-push-action` builds the image (`load: true`, `platforms: linux/amd64`, GitHub Actions cache `type=gha`). The script then runs with `--no-build`; locally it builds itself.
    - `release:check:render` (`scripts/release-check-render.ts`):
      1. Start the container with `--network host`.
      2. Check `GET /health`.
      3. Run `test:render` **on the host** against the container. It starts a small upload sink (Bun) and a fixture source server, so no test files ship in the runtime image.
      4. The sink checks the uploaded MP4 with `mediabunny`: H.264, the source's even size and its frame count ± 1.
      5. `renderStill` at the last frame must have at least 200 px within ΔE < 10 of `#00805F` inside line 1's box. The render uses a logo of about 2 MiB, which proves the size limit.
      6. Save the still as a CI artifact for the parity review.
    - Locally, `release:check` runs it only when `docker info` succeeds. Otherwise it prints `[render] Docker daemon not available: the render lane runs in CI only (not equivalent)`, as with `SMOG_OFFLINE`: CI is the authority.
    - `ci.yml`'s matrix becomes `[core, tests, mobile, render]`; deploy waits for all four.
17. **The image.**
    - **The context is `turbo prune @smog/render --docker`** (checked with turbo 2.11.5 against the Bun lockfile: `out/json` installs with `--frozen-lockfile`). The prune also pulls in `@smog/jobs`, `@smog/email` and `@smog/i18n` through a workspace devDependency path; Task 4 finds the edge and trims it if it is a stray dependency, otherwise records it. Dockerfile stages:
      1. `prune` (`oven/bun:1.3.11`, pinned by digest): `bunx turbo prune @smog/render --docker`.
      2. `build` (same base): copy `out/json`, `bun install --frozen-lockfile`, copy `out/full`, `bun src/server/bundle.ts` → `/app/bundle`.
      3. `deps` (same base): `bun install --frozen-lockfile --production --filter @smog/render`, then `bun src/server/ensure-browser.ts` (`ensureBrowser()`), so Chrome Headless Shell lands in **this** `node_modules` (`.remotion/`), which the runtime copies.
      4. `runtime` (`oven/bun:1.3.11-slim`, pinned by digest).
    - Both Bun images are **Debian trixie**, so the library list is checked against trixie: `libnss3 libdbus-1-3 libatk1.0-0t64 libgbm1 libasound2t64 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0t64 libpango-1.0-0 libcairo2 libcups2t64 ca-certificates`, with `--no-install-recommends` and runtime packages (`-t64`/non-`-dev`) where trixie renamed them. Task 4 runs `apt-cache policy` in the CI build log to prove each name.
    - The old image's bookworm choice was about arm64 mirror flakiness, and this image is amd64 only. Recorded.
    - The runtime copies `/app/bundle`, the `deps` `node_modules` and `src/server`, `chown`s them to 1001, then sets `USER 1001`, `EXPOSE 8080` and `CMD ["bun", "src/server/main.ts"]`. No system fonts: the overlay font is bundled.
    - A root `.dockerignore` keeps `node_modules`, `.wrangler`, `dist`, `apps/mobile` and the rest out of the prune stage's context.
    - The lane logs the image size (not gated).

## Global constraints

- Everything in the phase 1–6 global constraints still applies. That includes:
  - newest versions and the catalog (all Remotion packages on one exact version)
  - tokens-only styling (the overlay's fixed green is the contract's `tokens.color.brand.green`)
  - i18n-only copy in nl/en/fr, except the video's fixed Dutch intro line, which is content (`RENDER_OVERLAY_LAYOUT.text.intro`)
  - the code style and the commit trailer
  - append-only migrations (0011)
- **No `Bun.*` in workerd.** The Workflow, the Container class and every `@smog/sponsorships`/`@smog/video` change run in workerd. `Bun.*` is allowed only in `packages/render/src/server/*`, `scripts/*` and tests. A test in `@smog/render` scans `src/{contract,compositions,metadata,remotion,testing}` for `Bun.`.
- **No deploy, no Cloudflare credentials, no remote `wrangler` from the implementers.** Every push to `develop` deploys staging, so each task's merge must leave staging deploying exactly as before: no `SMOG_RENDER_PIPELINE`, `RENDER_MODE=fake`, so no `workflows` or `containers` in the built config. The furthest a task goes is `deploy:dry`; with the container block, `wrangler deploy --dry-run --containers-rollout=none` (a dry run otherwise needs Docker).
- **Every task ends with** `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` with **EXIT 0**, reported in the task report.
- Every status change still goes through `transition()` / `transitionStatements()`, and the `no-direct-status` scan covers the new files.
- D1 rules as in phase 6:
  - `inList`
  - one batch per change with `failWhen` guards
  - `ref` for correlated subqueries
  - keyset seeks with query-plan tests
- External services are faked at the adapter boundary:
  - the Mux fake (extended in Task 5)
  - the fake renderer (`@smog/render/testing`: `createFakeRenderer({ result | error | delayMs })`, which records requests)
  - Miniflare Workflows
  - `RENDER_MODE=fake` in e2e
  - No test calls real Mux or a real Container.
- Workflow step names are deterministic, step configs explicit, and step outputs small JSON with no signed URL. A test asserts every output of a full run is under 16 KiB and holds no signed `mux.com` URL.
- The e2e uses Playwright with Chromium at `/opt/pw-browsers`. **Never run `playwright install`.**
- Parallel tasks each touch only their own blocks in shared files:
  - the i18n catalogues: `sponsor.preview.*` (Task 8), `admin.sponsorships.renderJobs.*` / `admin.sponsorships.retryRender.*` (Task 7). Task 1 creates the empty blocks.
  - `routeTree.gen.ts`: regenerate on merge; never hand-merge it.
  - `bun.lock`: take either side and re-run `bun install`; never hand-merge it.
  - `docs/DECISIONS.md`: each task adds its entries under its own `## … (phase 7 task N)` heading, which Task 1 creates.
  - `packages/video/src/index.ts` exports belong to Task 5 only. `packages/features/sponsorships/src/server/index.ts` exports get one block each from Tasks 6 and 7; take both sides.
- Docs per task:
  - DECISIONS entries for the rulings it implements and any deviation
  - `docs/API.md` for `retryRender`, the webhook change and the render server's HTTP contract
  - `docs/DATA_MODEL.md` for migration 0011
  - the inventory `Done` ticks

## Review focus

1. Staging safety:
   - With today's settings (no flag, `RENDER_MODE=fake`), the built `dist/server/wrangler.json` has no `workflows`, `containers`, DO binding or migration. The only change is two extra exported classes.
   - `container` without the flag fails the build. `container` with it adds exactly the Workflow and the container block, with absolute, existing paths.
   - Nothing in the repo turns the flag on, and the ensure script probes nothing new while the gate is off.
2. Workflow correctness:
   - Every step is idempotent under replay. `start` continues on `already-running`.
   - Names and configs are deterministic and explicit.
   - A retried `render` never reuses an upload URL and is never blocked by its own container.
   - Every failure ends in `failRender` plus the email, or in the watchdog.
   - A duplicate start, a duplicate or late webhook, a commit after the watchdog, or a superseded attempt leaves one committed video and no orphan asset.
   - No signed URL reaches a log, an error summary or step state.
3. Parity:
   - The overlay matches the old `SponsorOverlay` (timing, spring, slide, the logo box, the two text lines' positions, colour and weight), with the documented changes: the bundled font, fit to width, even sizes, a pinned line height.
   - The Player and the render use the same component and props.
4. Boundaries and runtimes:
   - features import `@smog/render/contract` and `/testing` only;
   - `remotion`/`mediabunny` never reach the Worker bundle nor the site's entry chunks;
   - no `Bun.*` outside the server, scripts and tests;
   - the Container env is validated by `@smog/config/env/render`.
5. Asset hygiene as in ruling 13; expiry and force expire delete through `deleteAsset`.
6. Admin: `retryRender` writes its transition, the new job, its event and its audit entry in one batch, refuses anything not `render_failed` (`INVALID_STATE stale`), and a demoted admin is `FORBIDDEN`.

---

### Task 1: Foundations: dependencies, the render contract, env, boundaries, migration 0011

**Files:**
- Root `package.json`: the catalog (the Remotion packages, `mediabunny`, `@fontsource/inter`; `wrangler` and the Cloudflare plugins bumped). This task owns the root manifest for the phase; later tasks add only scripts.
- `packages/render/package.json`: exports `./contract`, `./composition`, `./metadata`, `./remotion`, `./testing`; scripts `serve`, `fixture`, `bundle`, `test:render`; deps. `tsconfig*.json` (the `react` base for `compositions`, a Bun tsconfig for `src/server`).
  - `src/contract.ts`: add `SPONSORED_VIDEO_ID`, `RENDER_FPS = 30`, `renderRequestSchema`, `renderResultSchema`, `RENDER_ERROR_CODES`, `isRetryableRenderError`; fix the "centred at y" comment (ruling 5).
  - `src/testing/{index,fake-renderer}.ts`.
  - **A bundling smoke:** `src/compositions/index.ts` exports a minimal `SponsoredVideo` placeholder (an `AbsoluteFill` reading the contract layout and `@smog/styles/tokens`, plus the font import), and `src/remotion/{index,root}.tsx` registers it. A `bun test` runs `@remotion/bundler` `bundle()` on that entry into a temp directory. That proves webpack resolves the workspace `.ts` packages through `exports` and the `.woff2` import before Tasks 3 and 4 depend on it (Minor 15). Task 3 replaces the placeholder with the composition.
  - No `notImplemented(` stubs (the phase 6 guard).
- `packages/config/src/env/render.ts` (`renderServerEnvSchema`), the `./env/render` export; `src/env/worker.ts`:
  - `RENDER_LOCAL_URL` and `RENDER_MODE=local`, dev only;
  - `REMOTION_LICENSE_KEY` (optional secret);
  - `RENDER_WORKFLOW`/`RENDERER` optional in `parseWorkerBindings`;
  - `requiredWorkerConfig(env, renderMode)` (ruling 11). Tests.
- `packages/config/src/boundaries.ts`: `@smog/render/testing` in the feature list (ruling 1), with its test.
- `packages/db`: `migrations/0011_render_job_status_idx.sql` (`db:generate`), the schema index, a query-plan test; `docs/DATA_MODEL.md`.
- knip (the new entry points: `src/server/main.ts`, `bundle.ts`, `fixture.ts`, `ensure-browser.ts`, the Remotion entry).
- The i18n empty blocks, the DECISIONS headings `## … (phase 7 task 1..9)`, `.dev.vars.example` (`RENDER_LOCAL_URL`, `REMOTION_LICENSE_KEY`, and a note that local mode is started with `SMOG_DEV_RENDER_MODE=local`).

**Interfaces:**
- `renderRequestSchema = { v: 1, renderJobId: uuid, input: renderInputSchema, sourceUrl: url, logoDataUrl: string | null (data:image/(png|jpeg|webp);base64,…, ≤ 2 MiB decoded), uploadUrl: url }`.
- `renderResultSchema = { ok: true, frames, width, height, bytes, ms } | { ok: false, code: RenderErrorCode, message }`.
- `RENDER_ERROR_CODES = ["invalidInput", "sourceUnreadable", "logoUnreadable", "busy", "renderFailed", "uploadFailed"]`.
- `requiredWorkerConfig(env: Environment, renderMode: RenderMode) → { secrets; vars }`. `REQUIRED_WORKER_CONFIG` stays as the file-mode view for existing callers.
- `createFakeRenderer(options) → RendererPort & { requests }`.

- [ ] TDD:
  - the contract: request and result schemas, the logo size cap, the retryable split
  - the env: `RENDER_LOCAL_URL` and `local` refused outside dev; the bindings parse with and without the two render bindings; `renderServerEnvSchema`; `requiredWorkerConfig` for `container` adds the Mux trio
  - the boundaries entry
  - migration 0011 applied to the dev seed and its query plan
  - the bundling smoke (it needs no Chrome)
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(render): render contract, env, boundaries and migration 0011`.

### Task 2: The render gate, the worker classes, provisioning checks and the CI lane

Depends on Task 1.

**Files:**
- `apps/site/render-config.ts` (+ test) and `vite.config.ts` (the gate in the `config` hook, and `SMOG_DEV_RENDER_MODE` for dev).
- `apps/site/wrangler.jsonc`: comment block only (no new keys; ruling 2).
- `apps/site/src/worker.ts`: export `RenderSponsorshipVideo` and `SmogRenderer`.
  - `src/worker/render-workflow.ts`: the class. Its `run` logs `[render] RenderSponsorshipVideo is wired in task 6` and returns `{ outcome: "noop" }`; nothing creates an instance yet.
  - `src/worker/renderer.ts`: `SmogRenderer extends Container` with ruling 3's fields.
- `apps/site/scripts/deploy-guard.ts`:
  - ruling 2's built-config assertions (container ⇔ block and `RENDERER`; `fake` ⇔ no `workflows`/`containers`; absolute existing paths);
  - no `@remotion/renderer`/`@remotion/bundler`/`remotion`/`mediabunny` markers in `dist/server`;
  - `REMOTION_LICENSE_KEY` not in `dist/client`.
  - Tests with built-config and chunk fixtures.
- `scripts/ensure-cloudflare-resources.ts` (+ test): the gated Workflows and Containers probes (ruling 2).
- `scripts/release-config-check.ts` (+ test): ruling 2's assertions and the four lanes.
- `.github/workflows/ci.yml`: the `render` matrix entry. Until Task 4 lands, `release:check:render` prints that the image arrives in Task 4 and exits 0. A guard test allows that only while `packages/render/container/Dockerfile` does not exist.
- `.github/workflows/deploy.yml`: `SMOG_RENDER_PIPELINE` to the ensure and deploy steps.
- `scripts/release-check-render.ts` (the placeholder body), the root `release:check:render` script, `release:check` updated.

**Interfaces:**
- `renderBindings(env: "dev" | "staging" | "production") → { workflows; container: { containers; durable_objects; migrations } }`.
- `applyRenderGate({ env, renderMode, flag }) → { add: Partial<WranglerConfig>; vars?: { RENDER_MODE } } | { error: string }`.

- [ ] TDD:
  - the gate's table (fake / local in dev / local in staging → error / container ± flag) and the absolute paths (and that the Dockerfile exists once Task 4 lands; until then that the path is absolute)
  - the deploy guard's assertions on fixtures
  - `release-config-check`: a render key in `wrangler.jsonc`, the flag missing from `deploy.yml`, a missing class export, a `container` env without the Mux trio, three lanes
  - the ensure probes with the fake runner: gate off → nothing new; on → Workflows refused, Docker missing, Containers refused, all fine
- [ ] Checks:
  - `CLOUDFLARE_ENV=staging bun -F @smog/site deploy:dry` passes, and the built `wrangler.json` has **no** `workflows`/`containers` (diff it against the build of `develop`: only the two class exports differ).
  - In a scratch copy with `RENDER_MODE=container` and `SMOG_RENDER_PIPELINE=1`: `vite build` and the guard pass, and `wrangler deploy --dry-run --containers-rollout=none` accepts the config (recorded in DECISIONS; a dry run without that flag needs Docker).
  - `SMOG_DEV_RENDER_MODE=local bun -F @smog/site dev` starts with the binding.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(site): the render gate, the workflow and renderer classes, provisioning checks and the render lane`.

### Task 3: The composition, the metadata reader and the font

Depends on Task 1.

**Files:**
- `packages/render/src/compositions/{index,sponsored-video,sponsor-overlay,background,font,fit,geometry,props}.tsx|ts`, with tests. These replace Task 1's placeholder.
- `src/metadata.ts`. Its unit tests use an injected source fake for the error paths: no video track gives `SourceUnreadableError`, odd sizes round down, and `dispose` runs on failure. The real-MP4 test is in Task 4, which commits the fixture.
- `src/remotion/root.tsx` (`calculateMetadata` from props).
- `src/no-bun.test.ts`: the `Bun.` scan.

**Behaviour:**
- Exactly ruling 5:
  - the background switch;
  - the overlay timing, spring and slide;
  - the logo box;
  - the two lines' positions and line height;
  - `overlayFontSize`.
- Ruling 6's font loading:
  - `loadFont` resolves before `measureText` (`validateFontIsLoaded: true`);
  - `delayRender`/`continueRender` around it in the composition, and `cancelRender` on failure;
  - an exported `loadOverlayFont()` for the Player.
- `sponsoredVideoPropsSchema` (Zod 4): `{ background: { kind: "video", src } | { kind: "image", src }, logoUrl: string | null, displayName: 1..35, durationInFrames ≥ 1, width/height even ≥ 2 }`.
- `readSourceMetadata(url, { source? })` uses `mediabunny` `Input` + `UrlSource`: `computeDuration()`, and the primary video track's display size rounded down to even. `dispose()` runs in `finally`.

- [ ] TDD (`bun test`, happy-dom for React):
  - `overlayFontSize`: a short name keeps `0.038 × height`; 35 wide characters at 1080 × 1920 shrink to fit 90 %; both lines share the size
  - `overlayGeometry` against the old formulas, at 1080 × 1920 and 720 × 1280 (line 1 top 1670.4 px at 1920; line 2 = line 1 + 1.5 × fontSize; the logo box 237.6 × 422.4 centred on (540, 1459.2))
  - the timing: frame `< start` renders nothing; at `start + fadeIn × fps` opacity ≈ 1 and `translateY` ≈ 0; a 3 s clip shows the overlay from frame 0
  - the props schema: odd sizes and 36 characters refused
  - `@remotion/player` `Thumbnail` in happy-dom at the last frame with the image background: the text and the logo `img` are present
  - the `Bun.` scan
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(render): the SponsoredVideo composition, ported from the old overlay`.

### Task 4: The render server and the container image

Depends on Tasks 2 (the lane) and 3 (the composition).

**Files:**
- `packages/render/src/server/{main,server,render,upload,logo-asset,bundle,ensure-browser,fixture,errors}.ts`, with tests.
- `packages/render/container/Dockerfile` (ruling 17), the root `.dockerignore`.
- `packages/render/test/fixtures/source-2s.mp4` (made by `bun -F @smog/render fixture`) and its regeneration note; the metadata test against it.
- `packages/render/test/render.e2e.ts` (`test:render`: the upload sink, the source server, the checks of ruling 16).
- `scripts/release-check-render.ts` (the real body: `--no-build` in CI; the build, run, health check, `test:render` and still artifact locally), the `ci.yml` steps (`docker/build-push-action` with `load: true` and the GHA cache, then the script, then `actions/upload-artifact` for the still).

**Interfaces:**
- `createRenderServer({ env, renderer: RenderPort, uploader: UploadPort, metadata: MetadataPort, log }) → { fetch(request): Promise<Response> }`. It is pure; the ports are the real Remotion, a `fetch` PUT and `readSourceMetadata` in `main.ts`, and fakes in `bun test`.
- `RenderPort.render({ props, outputPath, cancelSignal })`; the slot of ruling 7, keyed by `renderJobId`.

**Behaviour:** ruling 7 exactly.
- `fixture.ts` renders a 2 s, 360 × 640 test card from a tiny local composition registered only for the fixture (a coloured background and a frame counter, no source video).
- `serve` builds the bundle once when `RENDER_BUNDLE_DIR` (`.render-bundle/`, gitignored) is missing.
- Trim the stray `turbo prune` workspaces (ruling 17) or record why they stay.

- [ ] TDD (`bun test`, no Chrome):
  - every request refusal (body too large, a bad schema, an `http:` URL without `RENDER_ALLOW_HTTP`, a non-Mux upload host, a logo over 2 MiB) with its code and status
  - **the same job twice cancels the first** (fake render port observes the cancel signal) and the second completes
  - a different job → `busy`
  - the happy path with fake ports (the PUT body and headers, the logo served at `/assets/<id>/logo` and gone afterwards, the result)
  - the uploader's error mapping
  - temp-file cleanup on failure and on cancel
- [ ] `test:render` (real Chrome): render the fixture source with a ~2 MiB logo and a 35-character name; the checks of ruling 16. Run it locally with `RENDER_BROWSER_EXECUTABLE` pointing at `/opt/pw-browsers/chromium_headless_shell-1194` (or Remotion's download through the proxy), and record which worked and the render time. That time, scaled to 1 vCPU for the longest gesture clip, decides `standard-2` vs `standard-3` (ruling 3).
- [ ] `bun -F @smog/render serve` answers `/health` locally. The image cannot be built here (no Docker daemon), so push the branch and read the CI `render` lane's log before review: `apt` names, image size, render time.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0 (the lane prints its skip line here). Commit `feat(render): the Bun render server and the SmogRenderer image`.

### Task 5: `@smog/video` for renders: master access, the render upload, source resolution, webhook routing

Depends on Task 1.

**Files:**
- `packages/video/src/{master,render-upload,source,render-events}.ts` (+ tests).
- `src/uploads.ts`: `RENDER_JOB_PREFIX`, `renderJobPassthrough(id)`, `renderJobIdOf(passthrough)`, `cancelUpload`.
- `src/webhook-handler.ts`: the `onRenderEvent` and `isCurrentUpload` hooks (ruling 9).
- `src/assets.ts`: `master` in `muxAssetDataSchema`.
- `src/testing/fake-mux.ts` + `fake-server.ts`:
  - `GET /video/v1/playback-ids/:id`
  - `PUT /video/v1/assets/:id/master-access`
  - `master { status, url }` with `readyMaster(assetId)`, the master URL served by the fake server from a fixture
  - `PUT /video/v1/uploads/:id/cancel`
  - render uploads that accept the PUT and create the asset with the upload's passthrough
  - `emitWebhook(event)` (signs and POSTs to a configured URL, for local runs)
- `packages/video/src/index.ts` exports.

**Interfaces:**
- `assetIdForPlayback(mux, playbackId) → string | null` (404 → `null`).
- `enableMasterAccess(mux, assetId)` (idempotent).
- `masterState(mux, assetId) → { status: "ready" | "preparing" | "errored" | "none", url? }`.
- `createRenderUpload(mux, { renderJobId, test }) → MuxUpload & { url }` and `cancelUpload(mux, uploadId) → "cancelled" | "already-final"`.
- `renditionUrls(playbackId) → string[]` (`highest.mp4`, `high.mp4`) and `firstReachable(urls, fetch) → string | null` (HEAD).
- `RenderMuxEvent` and `toRenderMuxEvent(event) → RenderMuxEvent | null`.
- `handleMuxWebhook(request, { …, onRenderEvent?, isCurrentUpload?, mux? })`. Without `onRenderEvent`, a render event is logged and answered 200.

**Behaviour:**
- `"gone"` → 200; a throw → 503 with no dedupe marker.
- A non-current `asset.ready` deletes the asset and is not forwarded.
- Gesture uploads behave exactly as before; their tests stay green unchanged.
- The site route wires the hooks in Task 6.

- [ ] TDD (`bun test` against the fake):
  - the lookup, 404 → `null`
  - enable twice → one PUT
  - the master states
  - the render upload's body (passthrough, public, `test` only when asked, no `cors_origin`, no `master_access`)
  - cancel on a waiting upload and on one with an asset
  - `firstReachable`
  - `toRenderMuxEvent` for the four types and a non-render passthrough
  - the webhook: a render event forwarded once (a duplicate → `DUPLICATE`), `"gone"` → 200, a throw → 503 then forwarded on the retry, a non-current asset deleted, a gesture upload unchanged
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(video): master access, render uploads and render webhook events`.

### Task 6: The Workflow: `runRenderJob`, the classes, the starter switch and the webhook wiring

Depends on Tasks 2 and 5 (and Task 4's server for the local loop).

**Files:**
- `packages/features/sponsorships/src/server/render-workflow.ts` (`runRenderJob`, `RenderStep`, `RENDER_STEP_CONFIG`, `RENDER_WATCHDOG_CEILING`, `RenderJobFailure`, the ports, `summariseRenderError`).
- `render.ts`: `markRenderRunning` returns the four states (its existing callers adapt); a `readRenderJob` helper.
- `index.ts` exports (one block).
- `test/render-workflow.test.ts`, `test/helpers/fake-step.ts`. The fake step records names, configs and outputs, honours the explicit retries and timeouts, can "commit then throw" to simulate a lost step result, skips sleeps, and delivers events from a queue.
- `apps/site/src/worker/render-workflow.ts`: the real class, with the `RenderStep` adapter (`NonRetryableError` mapping) and the ports:
  - `createDb`, `createMux`;
  - `readLogo` from `MEDIA`;
  - the renderer: the `RENDERER` DO via `getContainer(…).fetch`, or the local client to `RENDER_LOCAL_URL`;
  - the queues, and `siteUrl`.
- `apps/site/src/worker/render.ts`: the switch with `workflowRenderStarter`.
- `apps/site/src/worker/renderer.ts`: `rendererFor(env, mode) → RendererPort | null`.
- `apps/site/src/routes/api/webhooks/mux.ts`: `onRenderEvent` → `sendEvent`, and `isCurrentUpload` (a one-row D1 read).
- `apps/site/vitest.config.ts`: a test-only `RENDER_WORKFLOW` binding in the Miniflare options.
- `apps/site/test/{render-workflow,render-starter,mux-webhook-render}.test.ts`.
- `packages/jobs/src/render-starter.ts`: remove `pendingRenderStarter` (knip) and update the comment.
- `docs/API.md`: the render server's contract and the webhook's render events.

**Interfaces:**
- `runRenderJob(step: RenderStep, deps: RenderJobDeps, params: { renderJobId }) → Promise<{ outcome: "completed" | "failed" | "noop"; code?: string }>`.
- `RenderJobDeps = { db, mux: Mux | null, readLogo, renderer: RendererPort | null, queues: JobQueues, siteUrl, environment, clock }`.
- `workflowRenderStarter(binding: Workflow | undefined, deps) → RenderStarter`.

**Behaviour:**
- Ruling 4 step by step, with ruling 9's events, ruling 10's logo, ruling 11's degradation and ruling 13's deletes.
- The event type's charset and length limit are checked in the installed runtime and recorded.
- `fake` mode is unchanged; the e2e and every phase 6 test stay as they are.

- [ ] TDD (Workers pool, the Mux fake, the fake renderer, the fake step):
  - the happy path: `queued → running → succeeded`, the sponsorship `in_review` with the new ids, step names and configs as in `RENDER_STEP_CONFIG`, every output < 16 KiB with no signed URL
  - a replayed `start` (commit then throw) → `already-running` → continues (B-2); a final job → `noop`
  - the source fallbacks: an unknown playback id → `highest.mp4`; `highest` 404 → `high.mp4`; neither → `sourceUnavailable`, then `failRender` and one email per admin; master `errored` → the fallback; 30 polls not ready → the fallback
  - a renderer `4xx` → no retry, failed; a `5xx` twice then success → one committed asset, the first upload cancelled, two uploads created
  - the `ready` wait: timeout → poll → ready; `errored` → failed
  - no Mux → `muxUnavailable`; no renderer → `rendererUnavailable`
  - a re-render deletes the previous sponsored asset (read in `start`) but never the gesture's own
  - a commit `noop` (the sponsorship moved, or the job failed by the watchdog) deletes the new asset (B-3)
  - a replayed `commit` deletes nothing
  - `summariseRenderError` strips URLs and caps at 300
  - the failure path replayed → no second email
  - `RENDER_WATCHDOG_CEILING` > the sum of the configs
- [ ] The class (ruling 15's three introspection tests).
- [ ] The starter:
  - `container`/`local` create an instance with `id = workflowInstanceId`;
  - a second `render.requested` is a no-op;
  - any other `create` error rethrows (the message is retried);
  - no binding → `workflowUnavailable` failed.
- [ ] The webhook route:
  - a `render-job:` `asset.ready` reaches a waiting instance;
  - an unknown instance → 200 `gone`;
  - a non-current upload → asset deleted;
  - no binding → 200, logged.
- [ ] A local loop by hand, recorded in DECISIONS:
  1. `SMOG_DEV_RENDER_MODE=local`, `bun -F @smog/render serve` (Chrome as in Task 4), the dev server with the Mux fake (`SMOG_DEV_MUX_API_URL`, `emitWebhook` to the dev server).
  2. A seeded paid sponsorship reaches `in_review` with a real overlay video in the fake's store.
  3. Note the time.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(sponsorships,site): the RenderSponsorshipVideo workflow and the pipeline starter`.

### Task 7: Render job control: `retryRender` (A-27), the watchdog, force expire through `deleteAsset`

Depends on Task 1 (migration 0011, the bindings). Independent of Task 6: it enqueues `render.requested` and reads instance status through a port.

**Files:**
- `packages/features/sponsorships/src/server/render.ts`: `createRenderJobStatements` gains `retried: { actorId }`. The read then expects `render_failed`, and the same batch transitions `render_failed → rendering` (`render_retried`), then the guards and the job. Export `retryRenderStatements`.
- `src/server/render-watchdog.ts` (`reconcileRenderJobs`) and its call in `sweeps.ts` `runStaleSweep`; `index.ts` exports (one block). Tests.
- `packages/features/admin`:
  - `contract/sponsorships.ts` `retryRender({ sponsorshipId }) → { renderJobId, attempt }` with `{ audit: "sponsorship.retry_render" }`;
  - `server/sponsorships.ts`: the handler, with `AdminSponsorshipServices.retryRender` injected; force expire through `@smog/video` `deleteAsset`;
  - `schema/audit.ts`: `sponsorship.retry_render` `{ renderJobId, attempt }`, mapped;
  - `client/use-admin-sponsorships.ts` `useRetryRender`. Tests.
- `packages/api/src/admin-deps.ts`: inject `retryRender`.
- `apps/site/src/components/admin/sponsorships/sponsorship-detail.tsx` + `action-dialogs.tsx`:
  - a "Retry render" button on a `render_failed` sponsorship (status card and render jobs section);
  - a confirm dialog;
  - a success toast plus a live-region announcement;
  - the `renderJobs.retryLater` copy removed;
  - each job row shows its error summary.
- `apps/site/src/worker/scheduled.ts`: the `WorkflowStatusPort` from `RENDER_WORKFLOW` when bound (`get(id).status()`, not found → `"not-found"`, `terminate()`), else `null`.
- `apps/site/src/server/e2e-seed.ts`: the `sponsorship` op accepts `status: "render_failed"` and seeds a `failed` `render_job` (attempt 1) for it (Minor 4).
- i18n `admin.sponsorships.retryRender.*`. `docs/API.md`.

**Behaviour:**
- `retryRender`:
  - only `render_failed`;
  - one batch: the guard, the transition and its event, the job (`attempt + 1`, a new id), `render_started`, the audit entry;
  - after the commit it enqueues `render.requested` (`onFailure: "log"`; the watchdog requeues a lost one);
  - `INVALID_STATE stale` for a lost race or any other status;
  - with `RENDER_MODE=fake` the job completes at once, as in e2e.
- The watchdog: ruling 12's table exactly.

- [ ] TDD:
  - retry from `render_failed`: one job with `attempt` 2, the events, the audit entry, one message
  - two concurrent retries → one job, one `stale`
  - from `in_review` → `stale`
  - a demoted admin → `FORBIDDEN`
  - `expectAudit`
  - the watchdog: every row of the table (with a fake status port), `terminate` before `failRender` on the ceiling row, `null` port → only the requeue row, run twice → one effect, the query plan on 0011
  - force expire through `deleteAsset`
  - UI (`sponsorships.test.tsx`): the button only on `render_failed`; confirm → mutation → announcement; focus returns
- [ ] e2e (`admin-sponsorships.spec.ts`, fake mode): seed `op: "sponsorship", status: "render_failed"`, retry, and see `in_review` with the trail entry (attempt 2) and the audit row.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(admin,sponsorships): retry render, the render watchdog and force expire through deleteAsset`.

### Task 8: The wizard preview: `SponsorPreview` with `@remotion/player` (S-10)

Depends on Task 3 (the composition) and Task 4 (the fixture; until it merges, route the stream to an abort and test the image fallback first).

**Files:**
- `apps/site/src/components/sponsor/{sponsor-preview,preview-picker,use-source-metadata}.tsx|ts`, with tests. `use-source-metadata` is imported only by `sponsor-preview`.
- `step-review.tsx` and `reedit-view.tsx` use them through the SSR-null lazy import (ruling 8).
- `overlay-preview.tsx` is deleted.
- `apps/site/package.json` (`@remotion/player`, `remotion`).
- i18n `sponsor.preview.*` (play, pause, show the ending, the fallback note, the picker's label, loading).
- `apps/site/e2e/{sponsor,csp}.spec.ts`: the stream route to the fixture, the Player under the CSP, and the fallback when the route aborts.
- `apps/site/scripts/deploy-guard.ts`: the entry-chunk check (the client manifest: `remotion`/`mediabunny` only in lazy chunks), plus a fixture test with a `dist/server` chunk containing `remotion`.

**Behaviour:** ruling 8 exactly.
- `useSourceMetadata(playbackId)` tries `highest.mp4`, then `high.mp4`. It is cached per playback id for the page's life, and an `AbortController` cancels on unmount.
- The Player sits in an aspect-ratio box with no layout shift.
- The picker uses the kit's toggle-group pattern (or buttons with `aria-pressed`) with arrow keys.
- The display name and logo update `inputProps` without remounting.

- [ ] TDD (happy-dom; the Player mocked at its boundary to assert props):
  - the props (the source URL, the logo object URL, the name, the metadata size and duration, `initialFrame` = last frame)
  - the fallback to `image` when both MP4s fail
  - the control labels in nl/en/fr
  - the picker switches gestures and keeps focus
  - the server render shows the poster and no `remotion` import
- [ ] e2e:
  - the review step plays the fixture through the Player (`page.route('https://stream.mux.com/**', …)`), and "Show the ending" shows the overlay text;
  - the re-edit page;
  - an aborted stream → the image fallback and its note;
  - axe at 390 and 1280 in light and dark; a keyboard-only run;
  - the CSP spec: no violation.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(site): the Remotion Player sponsor preview`.

### Task 9: Hardening, parity, the staging switch and docs

Depends on Tasks 1–8.

**Files:** fixes in any phase 7 file, `apps/site/e2e/sponsor-screenshots.spec.ts` (the Player state), `docs/{API.md,DECISIONS.md,PROGRESS.md,DATA_MODEL.md}`, the spec's §8.2 amendments (§8.2.1 path `src/compositions`; §8.2.3.2–.7 per rulings 4, 9 and 10; the jobs layout line per ruling 1), DECISIONS line 446 marked superseded, the inventory ticks, the `apps/site/wrangler.jsonc` comment, `.dev.vars.example`, AGENTS.md (the render commands, `SMOG_DEV_RENDER_MODE`, `SMOG_RENDER_PIPELINE`, the lane, the token permissions).

**Behaviour:**
- **The parity walk.** Put the CI lane's still artifact beside the old composition's numbers (and a stored old sponsored video from the owner, if one is given). Check:
  - the overlay timing (the last 5 s, a 1 s spring, 30 px);
  - the logo box (22 % at 50 %/76 %, `contain`);
  - the text (top at 87 %, the line 2 offset, `#00805F`, weight 600, pinned line height);
  - the size and frame rate from the source.
  - Record the documented differences: the font, fit to width, even sizes, no `master_access`/`cors_origin: "*"` on the rendered asset, the 10 s polls, `OffthreadVideo`, the bundle built with the image, the playback-id lookup.
- Tick S-10, S-17 and S-25 (built; deployed once turned on), A-27, the A-15 retry button, S-24's retry and W-02 (with the master.ready amendment).
- **The staging switch, prepared but not flipped:**
  - `release-config-check` passes on the committed files;
  - the scratch-copy gate build of Task 2 is re-run on the final tree;
  - PROGRESS gets the owner sequence below.
- **Staging smoke (owner, after the flip; recorded as pending until then):**
  - a Mollie test payment (or an admin mark-paid) reaches `in_review` with a video whose last 5 s show the overlay;
  - `wrangler tail --env staging` shows the `[render]` steps;
  - a forced failure (an invalid source) gives `render_failed`, the admin email and a working retry;
  - the Mux dashboard shows no orphan asset after a retry.
- PROGRESS:
  - log the phase 7 tasks;
  - close carries 1–9 (2 and 8 as gated, with the owner items);
  - the **phase 8 carries:**
    - the migration script enables `static_renditions: highest` on imported gesture assets (the old upload code never set renditions, so the preview shows the image fallback and the render's fallback source fails until then);
    - separate Mux environments per env (more urgent now);
    - `requiredWorkerConfig` checked against `wrangler secret list` (render-mode aware);
    - **the retention of a rejected sponsorship's video**, decided with the legal sign-off, and `rejected → changes_requested` bounded to match;
    - the welcome-claim migration takes the number after 0011.
  - Update "Pending before develop → master": production needs the owner actions below on the `production` environment, and a production smoke render.
- **Owner actions (PROGRESS):**
  1. **Before flipping:** confirm that the staging `CLOUDFLARE_API_TOKEN` can deploy **Workflows** and **Containers** and push to the Cloudflare Registry (Containers on the account need Workers Paid). With the gate on, `ensure-cloudflare-resources` probes `wrangler workflows list` and `wrangler containers list` and names what is missing. Update the AGENTS.md / PROGRESS permission list with the confirmed permission names.
  2. Give staging its own Mux environment: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` (`wrangler secret put --env staging`), the webhook at `<staging SITE_URL>/api/webhooks/mux`, and the Cloudflare Access bypass for `/api/webhooks/*` (phase 6 smoke). Without them every real render fails with `muxUnavailable`.
  3. Set the `staging` GitHub environment variable `SMOG_RENDER_PIPELINE=1`, then change `env.staging.vars.RENDER_MODE` to `container`. The other order fails the build on purpose. Turning the flag off later leaves the container idle; the class exports stay.
  4. Confirm that Remotion's free licence applies (SMOG & Co vzw is a non-profit); otherwise buy a company licence and set `REMOTION_LICENSE_KEY`.
  5. Accept the container cost: `standard-2` (or `standard-3` if Task 4's timing chose it), at most 2 instances in staging and 4 in production, sleeping after 10 minutes.
  6. The same for production before launch.

- [ ] The full site e2e passes, and the CI run of the branch is green on all four lanes (read its log).
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `test(site): render parity, the staging switch and phase 7 docs`.

---

## Parallelism

| Wave | Tasks | Why they can run together |
|---|---|---|
| A | 1 | Every later task needs the dependencies, the contract, the env and bindings, the boundaries entry, migration 0011, the i18n blocks and the DECISIONS headings. Task 1 owns the root `package.json`. |
| B | 2, 3, 5, 7 | Disjoint: 2 is `apps/site/{render-config.ts,vite.config.ts,scripts/deploy-guard.ts}`, `src/worker.ts`, `worker/{render-workflow,renderer}.ts`, `scripts/{ensure-cloudflare-resources,release-config-check,release-check-render}.ts` and the workflows; 3 is `packages/render/src/{compositions,metadata,remotion}`; 5 is `packages/video/*`; 7 is `sponsorships/src/server/{render,render-watchdog,sweeps}.ts`, `packages/features/admin/*`, `packages/api/src/admin-deps.ts`, the admin detail components, `worker/scheduled.ts` and `server/e2e-seed.ts`. Shared: the i18n blocks and one export block each in `sponsorships/server/index.ts`. |
| C | 4, 6, 8 | 4 needs 2 (the lane) and 3 (it bundles the composition); 6 needs 2 (the class stubs) and 5 (the Mux surface), and edits `sponsorships/src/server/render.ts` after Task 7 merged (`markRenderRunning`, a different function); 8 needs 3 and owns `components/sponsor/*`, the sponsor e2e and the deploy guard's chunk check (a separate function from Task 2's). Task 8's e2e and Task 6's local loop use Task 4's fixture and server (merge 4 first, or 8 routes to the image fallback until then). |
| D | 9 | Needs all of them. |

Nine tasks, one over the 6–8 target. The review split Task 1: dependencies, contract, env and migration (1) on one side; the gate, guard, provisioning and CI (2) on the other. They have different review focuses, and putting both in one slice made it too big for one implementer.

## Moved to later phases

- Phase 8:
  - Enable static renditions on migrated gesture assets (the preview and the render's fallback source).
  - Separate Mux environments per deploy env, with their webhooks.
  - `requiredWorkerConfig` checked against the real secrets.
  - The retention of rejected sponsorships' videos, with the legal sign-off.
  - The production render flag and the production smoke render.
- Phase 9:
  - A render latency and cost check on staging with real gestures (the p95 render time per clip length).
  - An alert on DLQ or `render_failed` spikes.

## Open risks (for the reviewer and the owner)

1. **Workflows and Containers access is unconfirmed.** The gate (ruling 2) keeps staging's deployed config unchanged until the owner confirms it and flips. Even then, the first real deploy is the first proof of registry push.
2. **The container config injected by the hook.** With absolute paths and the guard's existence check this should hold, but the first real `wrangler deploy` of a container happens only after the flip. `--dry-run --containers-rollout=none` checks the config, not the image push.
3. **A long synchronous `POST /render`** from a Workflow step. A dropped response re-runs the step, which is now safe and fast: a fresh upload, the container replaces the same job's render, and the old upload is cancelled. If staging shows requests cut off routinely, switch to `202` plus polling `GET /render/:id`; a breaking contract change bumps `v`.
4. **Remotion under Bun** in the container. The old production server ran exactly that, and the CI `render` lane proves it on every change. If a Remotion release breaks Bun, `renderMedia` alone can move to Node in the image, with a DECISIONS entry (the spec says Bun).
5. **Mux master URLs** are read server side by `OffthreadVideo`, and their metadata in Bun. Migrated or pasted assets without master access fall back to the static renditions, which migrated assets lack until phase 8 enables them.
6. **The image on Debian trixie.** The library names are checked in the CI build log (ruling 17). Its size is about 1 GB, and once the gate is on the deploy job builds it uncached: several minutes per staging deploy, within the 30-minute job timeout.
7. **Render time on 1 vCPU** for the longest gesture clip. Task 4 measures it and may choose `standard-3`.
