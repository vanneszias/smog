# Remotion Lambda Render Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid sponsorship's composed video is actually rendered. At checkout, `apps/site` submits the render to Remotion Lambda in `eu-central-1`, and Lambda's signed webhook drives the existing callback → Mux → sponsorship path. The compositions live in a new `apps/render` that owns the Lambda deploy.

**Architecture:**
- **`apps/render`** holds the compositions, copied from `apps/remotion`, and the `remotion lambda` deploy scripts.
- **The contract** between `apps/render` and `apps/site` moves into `@smog/types`, so a renamed composition or prop fails the typecheck: the composition id, the input-prop type and the sponsor-name cap.
- **`apps/site` invokes the Remotion "start" routine itself.**
  - It uses a SigV4-signed `fetch` via `aws4fetch` against Lambda's `InvokeWithResponseStream` API.
  - It decodes the AWS event stream and Remotion's `remotion_buffer:` framing.
  - A contract test proves its payload is byte-identical to what `@remotion/lambda-client` would send. That package is a **dev dependency only**: Stage 6 measured it at +753 KiB gzipped, bundling the AWS SDK and `node:` modules.
- **Job identity:**
  - `apps/site` mints its own job id, claims the `renders` row **before** invoking, and passes the id to Lambda as webhook `customData`.
  - The callback matches on `customData.jobId`.
  - If the invocation fails, the claim is released.
- **Stranded renders:** the hourly settle sweep fails renders whose callback never arrived. Remotion retries a webhook only twice.

**Tech Stack:**
- Remotion 4.0.484: `@remotion/lambda` CLI in `apps/render` (dev only); `@remotion/lambda-client` in `apps/site` tests (dev only).
- `aws4fetch` for SigV4 (already in the tree via `@opennextjs/aws`; becomes a direct dependency).
- Payload 3.89 on Workers + D1.
- Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-payload-migration-design.md`, lines 35-36, 49, 165-187 and 815-823. Its "polls for completion" (173-175, 1768) is stale: Stage 6 built a callback, and this plan keeps it. Also Stage 6's plan `docs/superpowers/plans/2026-09-21-stage-6-video.md`, its Task 6 checklist (741-751) and "Carried out of Stage 6" (823-846).

**Decisions (user, 2026-09-23):**
- Build the Lambda transport now.
- Region `eu-central-1`.
- Compositions move into a new `apps/render` (per the spec).
- No AWS credentials are available to this work. Everything is proven locally against Remotion's own code, and the first real render happens at deploy time, per the runbook.

## Facts read from Remotion 4.0.484's source (scratch copies of the npm tarballs, not the repo)

- **The start payload.** `@remotion/lambda-client`'s `renderMediaOnLambda` → `internalRenderMediaOnLambdaRaw` → `awsImplementation.callFunctionSync({ type: "start", payload: await makeLambdaRenderMediaPayload(input) })`. The payload is a flat JSON object of about 60 fields, including `version: VERSION` (`"4.0.484"`); the function refuses a mismatched version. `inputProps` is serialized by `compressInputProps`: small props are inline as `{ type: "payload", payload: "<json string>" }`, large ones are uploaded to S3. Ours are always small.
- **The invocation.** `InvokeWithResponseStreamCommand({ FunctionName, Payload: JSON.stringify({ type, ...payload }) })`. The response is an AWS event stream (`application/vnd.amazon.eventstream`) of `PayloadChunk` and `InvokeComplete` events. The concatenated chunk payloads carry Remotion's own framing: `remotion_buffer:<nonce>:<length>:<status>:<data>`. `status` is `1` for an error. The nonce is a message-type id: `3` = `render-id-determined`, `2` = `error-occurred`, and so on (see `messageTypes` in the client). `callFunctionSync` resolves with the final message's JSON, which holds `renderId` and `bucketName`.
- **The webhook** (`@remotion/serverless/dist/invoke-webhook.js`):
  - `POST <url>` with a JSON body.
  - Headers `X-Remotion-Signature: sha512=<hex(HMAC-SHA512(body, secret))>` and `X-Remotion-Status: <type>`.
  - Timeout 10 s; **retries: 2**, with exponential backoff from 1 s.
  - The body includes `type` (`success`, `error` or `timeout`), `renderId`, `outputUrl` (on success), `errors` (on error) and `customData` (echoed from the submission).

The implementer of each task must re-read the relevant part of those sources from `node_modules` once installed. **Where the installed code disagrees with this section, the code wins; note it in the report.**

## Global Constraints

- **Exact version pin: `4.0.484`** for every `remotion` / `@remotion/*` package added, matching `apps/remotion`. No caret.
- **Region `eu-central-1`.** Set it as `REMOTION_REGION` in both environments' `vars` in `apps/site/wrangler.jsonc`, and as the `--region` of every `apps/render` deploy script.
- **Nothing from `@remotion/lambda`, `@remotion/lambda-client`, `@aws-sdk/*` or `@remotion/serverless` may be reachable from the Worker bundle.**
  - They are dev dependencies, imported only by `*.test.ts` files or `apps/render` scripts.
  - Re-measure the bundle with `wrangler deploy --dry-run` (`scripts/check-bundle-size-ci.ts`) at the end of Task 4, and record the delta against 7.40 MiB gzipped.
  - Budget for this plan: **under 50 KiB gzipped**. Stop and report if it is exceeded.
- **AWS credentials are Worker secrets:** `REMOTION_AWS_ACCESS_KEY_ID` and `REMOTION_AWS_SECRET_ACCESS_KEY`, the names Remotion's own tooling uses.
  - Read per call through `process.env`, never at module scope (the `lib/mollie.ts` trap).
  - Never logged, never put in an error message, never passed to `envVariables`.
  - `REMOTION_FUNCTION_NAME` and `REMOTION_SERVE_URL` are non-secret `vars` filled in after the deploy; until then they are absent, and the transport logs and does nothing, exactly as today.
- **The webhook secret is `RENDER_CALLBACK_SECRET`.** It is passed in `webhook.secret` and verified by `lib/renderSignature.ts`. The scheme switches to Remotion's: `{ algorithm: "SHA-512", header: "x-remotion-signature", prefix: "sha512=" }`.
- **Output privacy `"public"`.** Mux ingests `outputUrl` by URL, and the resulting Mux asset is `playback_policy: "public"` anyway (spec correction at 1332-1354). State this in a comment beside the option.
- **A render failure never fails a checkout.** This is the existing contract of `submitRenders` in `endpoints/sponsorships.ts`: `submitRenderJob` still never throws to its caller.
- **No job data in logs:** no signed source URL, no input props, no sponsor name. Ids and counts only.
- **`apps/remotion` stays** until the cutover's 30-day hold ends (`docs/cutover-runbook.md`, section 5). The legacy Docker stack still runs it. This plan copies its compositions; it does not delete or edit them. The temporary duplication is recorded, and ends when `apps/remotion` is deleted.
- **Knip-clean.** No export that nothing imports. `apps/render` gets a `knip.json` workspace entry.
- **Before every commit:**
  - `bun check`
  - `bun check-types` (root)
  - the touched packages' tests
  - `bunx knip --no-progress --no-config-hints`
- Commit trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HoyAb6WYMCQt9UPTpfMtSF
  ```

## Review Focus

1. **The hand-built payload drifting from Remotion's.** Expected: a test builds the same render with `@remotion/lambda-client`'s `renderMediaOnLambda`, captures the request body through an injected `requestHandler`, and asserts deep equality with ours. A Remotion upgrade then fails loudly. Owned by Task 3.
2. **A stream that is not a clean success**, such as an error frame, an `InvokeComplete` with an `ErrorCode`, a truncated frame, or a non-200 HTTP status. Expected: the transport throws a `[remotionLambda]` error naming the case, and `submitRenderJob` releases the claim and logs. Owned by Task 3, with fixtures encoded by AWS's and Remotion's own encoders, not hand-typed.
3. **A webhook for a job this app never claimed, or with no `customData.jobId`.** Expected: 200 `{status:"ok"}` with no work, as today for an unknown `renderId`. Owned by Task 4.
4. **A callback that never arrives** (three failed deliveries, or a start that died after `render-id-determined`). Expected: the settle sweep fails a `queued` or `rendering` render older than six hours, with a reason. The sponsorship keeps its non-composed preview, and nothing is deleted. Owned by Task 5.
5. **The contract between apps.** Expected: renaming the composition id or a prop in `@smog/types` breaks both `apps/render` and `apps/site` at typecheck. Owned by Task 1 and Task 2.

---

### Task 1: The render contract in `@smog/types`

**Files:**
- Create: `packages/types/src/render.ts`
- Modify: `packages/types/src/index.ts` (re-export)
- Modify: `apps/site/package.json` (add `"@smog/types": "workspace:*"`)
- Modify: `apps/site/src/lib/renderJob.ts` (use the contract instead of local `COMPOSITION_ID`, `SponsoredVideoProps` and the name cap)
- Test: `apps/site/src/lib/renderJob.test.ts` (existing; must stay green)

**Interfaces — produces:**
```ts
/** The one composition `apps/render` registers and `apps/site` renders. */
export const SPONSORED_VIDEO_COMPOSITION_ID = "SponsoredVideo";
/** Longest sponsor name the overlay fits; both apps enforce it. */
export const SPONSOR_NAME_MAX_LENGTH = 35;
/** Input props of `SPONSORED_VIDEO_COMPOSITION_ID`, as the Worker sends them. */
export interface SponsoredVideoInputProps {
  logoUrl?: string;
  sponsorName: string;
  videoSrc: string;
}
```
`overlayConfig` is deliberately absent. The site never sends it, and the composition falls back to `DEFAULT_OVERLAY_CONFIG`. Say so in the doc comment.

- [ ] Step 1: Read `apps/site/src/lib/renderJob.ts`, its test, and wherever the site caps the sponsor name at 35. Find it with `grep -rn "35" apps/site/src/lib apps/site/src/endpoints | grep -i sponsor`.
- [ ] Step 2: Add `render.ts` and the re-export. Make `apps/site` import `SPONSORED_VIDEO_COMPOSITION_ID`, `SponsoredVideoInputProps` and `SPONSOR_NAME_MAX_LENGTH` from `@smog/types`, replacing the local copies. The existing tests must pass unchanged, apart from imports.
- [ ] Step 3: Confirm the change is load-bearing. Temporarily rename `sponsorName` in the interface; `bun -F site check-types` must fail. Restore it.
- [ ] Step 4: Run the checks, then commit: `refactor: move the render contract into @smog/types so both apps typecheck against it`.

### Task 2: `apps/render` — the compositions and the Lambda deploy

**Files:**
- Create: `apps/render/package.json`, `apps/render/tsconfig.json`, `apps/render/remotion.config.ts`, `apps/render/README.md`
- Create by copying from `apps/remotion` (content unchanged except as stated): `src/index.ts`, `src/Root.tsx`, `src/compositions/**`, `src/types/schema.ts`, `src/utils/get-media-metadata.ts`
- Create: `apps/render/src/types/schema.test.ts`
- Modify: `knip.json` (a new `workspaces["apps/render"]` entry)

**Interfaces:**
- Consumes: Task 1's contract. In `Root.tsx`, `id={SPONSORED_VIDEO_COMPOSITION_ID}`. In `schema.ts`, `.max(SPONSOR_NAME_MAX_LENGTH, …)`. Add a type-level assertion that `SponsoredVideoInputProps` is assignable to `z.input<typeof SponsoredVideoSchema>`, so the two cannot drift. The same `overlayConfig` optionality applies.
- Produces:
  - Scripts:
    - `bundle` (`remotion bundle`)
    - `check-types` (`tsc --noEmit`)
    - `test` (`vitest run`)
    - `dev:studio` (`remotion studio`)
    - `deploy:function`: `remotion lambda functions deploy --region=eu-central-1 --memory=3009 --timeout=240 --disk=2048 --yes`
    - `deploy:site`: `remotion lambda sites create src/index.ts --site-name=smog-render --region=eu-central-1`
  - The deploy commands print the function name and serve URL; the README says where they go (Task 5).

Setup details:
- **Dependencies, pinned exactly to `4.0.484`:** `remotion`, `@remotion/cli`, `@remotion/media`, `@remotion/zod-types`, `mediabunny` (the version `apps/remotion` uses), `zod` (the workspace catalog), and `@smog/types`.
- **Dev dependencies:** `@remotion/lambda@4.0.484` (the deploy CLI, never imported by app code), `vitest`, `typescript`, `@types/react`.
- **React:** do not pin 18. Take the root `overrides` React 19.2.0. First check Remotion 4.0.484's `peerDependencies` for React 19 support, and record what they say. If React 19 is not supported, stop and report (NEEDS_CONTEXT) rather than fighting the override.
- **Tests (`schema.test.ts`):**
  - The schema accepts `{ videoSrc: "https://example.test/a.mp4", sponsorName: "SMOG" }`.
  - It rejects a 36-character name and a non-URL `videoSrc`.
  - `Root.tsx` registers `SPONSORED_VIDEO_COMPOSITION_ID`. Import the constant and assert it is what `Root.tsx` uses: a string search of the file, or a mocked `Composition` that records `id`, whichever is less brittle.
- **Proving it builds:** `bun -F render bundle` must produce a bundle. If Chrome is not needed for `bundle`, no browser download is needed. Also run `bunx remotion still src/index.ts SponsoredVideo /tmp/…png --props='{"videoSrc":"<a small public mp4>","sponsorName":"SMOG"}'` if the headless browser can be fetched in this sandbox. Record either way.
- **README:**
  - The one-time AWS setup: `npx remotion lambda policies user` / `role`, the IAM user whose keys become the two Worker secrets, and `eu-central-1`.
  - Deploy order: function, then site.
  - Redeploy the site on every composition change; redeploy the function on every Remotion version bump. **A version bump also requires `apps/site`'s pinned payload version to move, and Task 3's contract test enforces that.**
- **knip:** entry `["remotion.config.ts", "src/index.ts"]`, `ignoreDependencies: ["@remotion/cli", "@remotion/lambda"]` (CLI only), plus whatever else knip reports, each justified in the report.

- [ ] Steps: write the failing schema test → copy the files and wire the contract → green → `bundle` → the checks → commit `feat(render): apps/render with the compositions and the Remotion Lambda deploy scripts`.

### Task 3: `apps/site/src/lib/remotionLambda.ts` — invoke the start routine

**Files:**
- Create: `apps/site/src/lib/remotionLambda.ts`
- Create: `apps/site/src/lib/remotionLambda.test.ts`
- Modify: `apps/site/package.json`:
  - dependency `aws4fetch` (the version already in `bun.lock`);
  - dev dependencies `@remotion/lambda-client@4.0.484` and `@smithy/eventstream-codec` (the version `@remotion/lambda-client`'s bundled SDK uses, or the lockfile's);
  - `@remotion/serverless@4.0.484` for its stream-message encoder, if it exports one. Otherwise build fixtures with the client's own exported helpers, and record which.

**Interfaces — produces (the only exports):**
```ts
export interface StartRenderInput {
  composition: string;
  functionName: string;
  inputProps: SponsoredVideoInputProps;
  region: string;
  serveUrl: string;
  webhook: { customData: { jobId: string }; secret: string; url: string };
}
export interface StartedRender { bucketName: string; renderId: string }
export async function startRemotionRender(input: StartRenderInput): Promise<StartedRender>;
```
Credentials come from `process.env.REMOTION_AWS_ACCESS_KEY_ID` / `REMOTION_AWS_SECRET_ACCESS_KEY` inside the call. If either is missing, throw `[remotionLambda] AWS credentials are not set`.

Implementation requirements:
- **`buildStartPayload(input)`** (module-private) returns exactly what `makeLambdaRenderMediaPayload(renderMediaOnLambdaOptionalToRequired(options))` returns for these options:
  - `{ codec: "h264", composition, serveUrl, region, functionName, inputProps, privacy: "public", webhook, logLevel: "info", maxRetries: 1 }`
  - every other option at the client's default;
  - `type: "start"`, `version: "4.0.484"`, and `inputProps` as `{ type: "payload", payload: JSON.stringify(inputProps) }`.
  - Read both functions in the installed `@remotion/lambda-client` and copy the defaults field by field. A comment cites the client file and version.
- **The request:** `POST https://lambda.<region>.amazonaws.com/2021-11-15/functions/<encodeURIComponent(functionName)>/response-streaming-invocations`, with body `JSON.stringify(payload)`, signed with `new AwsClient({ accessKeyId, secretAccessKey, region, service: "lambda" })`, and `signal: AbortSignal.timeout(30_000)` (the client's own stall timeout). A non-2xx response throws, with status and AWS error type, never the body wholesale.
- **The decode:**
  - Parse the event-stream frames: prelude of total length and headers length (4-byte big-endian each) plus prelude CRC; headers; payload; message CRC. Verify both CRCs with a small CRC32.
  - Collect `PayloadChunk` payloads, and stop at `InvokeComplete`. An `InvokeComplete` carrying `ErrorCode` throws.
  - Feed the chunks through a port of `makeStreamer` for the `remotion_buffer:` framing.
  - An `error-occurred` message, or status `1`, throws with Remotion's message.
  - The result is `{ renderId, bucketName }` from the final JSON message. Read `callFunctionSync` to see exactly which message carries them, and mirror it.
- **Tests, each seen failing first:**
  1. **Payload contract (Review Focus 1).** Call the real `renderMediaOnLambda` from `@remotion/lambda-client` with fake credentials in `process.env`, and a `requestHandler` whose `handle()` captures the request and resolves an empty stream (or rejects after capture). Assert `JSON.parse(captured body)` deep-equals `buildStartPayload` for the same input. Test through an internal test-only path without adding an export (for example, spy on `fetch` and compare its body), so knip stays clean.
  2. The signed request: URL, method, the `authorization` header present with SigV4 `Credential=…/eu-central-1/lambda/aws4_request`, and the body.
  3. **Success.** A fixture stream built with `@smithy/eventstream-codec` wrapping Remotion-framed messages (built with Remotion's encoder, or the framing format verified against `makeStreamer`) resolves `{ renderId, bucketName }`.
  4. **Error frame**, `InvokeComplete` with `ErrorCode`, a truncated frame, a bad CRC, and HTTP 403: each throws a distinct `[remotionLambda]` message (Review Focus 2).
  5. Missing credentials throw before any fetch.
- [ ] Steps: failing tests → implementation → green → the checks → commit `feat(site): invoke Remotion Lambda's start routine with a signed fetch, byte-identical to the official client`.

### Task 4: Submit renders for real, and match callbacks by job id

**Files:**
- Modify: `apps/site/src/lib/renderJob.ts` (replace `submitRenderJob`'s body; keep its signature and its never-throws contract)
- Modify: `apps/site/src/lib/renderSignature.ts` (switch `RENDER_SIGNATURE_SCHEME` to Remotion's SHA-512 scheme; keep both known-answer tests)
- Modify: `apps/site/src/endpoints/render.ts` (`parseReport`: `jobId` from `customData.jobId`; a missing or non-string one is treated as an unknown job)
- Modify: `apps/site/wrangler.jsonc` (`REMOTION_REGION: "eu-central-1"` in both environments' `vars`, with a comment that `REMOTION_FUNCTION_NAME` / `REMOTION_SERVE_URL` join it after the deploy)
- Test: `apps/site/src/lib/renderJob.test.ts`, `apps/site/src/endpoints/render.int.test.ts`, `apps/site/src/endpoints/sponsorships.int.test.ts`, `apps/site/src/lib/renderSignature.test.ts`

**Behaviour of the new `submitRenderJob`:**
- **Unconfigured** (no function name, region or serve URL): unchanged — the info log and return.
- **Configured:**
  1. Build the submission, as today.
  2. `jobId = crypto.randomUUID()`.
  3. `claimRenderJob(payload, { jobId, sponsorship })`. If that returns `null`, log and return.
  4. `startRemotionRender({ … webhook: { url, secret: RENDER_CALLBACK_SECRET, customData: { jobId } } })`.
  5. On success, log `[renderJob] Submitted render <jobId> for sponsorship <id> (Remotion render <renderId>)`.
  6. On any throw, call `releaseRenderJob(payload, jobId)` and log `[renderJob] Failed to submit…` with the error's message only. Never rethrow.
- **Missing `RENDER_CALLBACK_SECRET`:** refuse before claiming, with a log. A render whose callback would 401 must not be started.

Tests:
- Configured → `startRemotionRender` is called (mock the module) with `customData.jobId` equal to the claimed row's `jobId`, and the webhook URL `<origin>/render/callback`.
- A start failure releases the row: no `renders` row remains.
- A checkout still answers its normal redirect when submission throws (the existing sponsorships int tests, extended).
- The callback with `customData: { jobId }` and a valid SHA-512 signature settles the render.
- The same body with the old SHA-256 header gets 401.
- A body with no `customData` gets 200, and no render changes (Review Focus 3).

- [ ] Re-measure the bundle with `bun -F site build:app` and `wrangler deploy --dry-run` (the CI script), and record the before and after. Over 50 KiB gzipped → stop and report.
- [ ] Steps: failing tests → implementation → green → bundle measurement → the checks → commit `feat(site): submit sponsor renders to Remotion Lambda and settle them by our own job id`.

### Task 5: Renders whose callback never arrives, and the operator docs

**Files:**
- Modify: `apps/site/src/jobs/expireSponsorships.ts` (`settleComposedVideos`, or a sibling called from the same task)
- Test: `apps/site/src/jobs/expireSponsorships.int.test.ts`
- Modify: `docs/deployment-checklist.md`:
  - the `REMOTION_*` rows: region in `vars`; function name and serve URL as `vars` once deployed; the two AWS secrets;
  - the render secrets' rows: no longer "inert";
  - the Open items / Launch blockers entries for Remotion.
- Modify: `docs/cutover-runbook.md` (decision 7: built, and what the operator still does — AWS account, IAM user, `bun -F render deploy:function`, `deploy:site`, set the vars and secrets, one real staging render before the window)
- Modify: `apps/render/README.md` (link the two docs)

Behaviour:
- A `renders` row in `queued` or `rendering`, whose `createdAt` is older than `STALLED_RENDER_AFTER_MS = 6 * 60 * 60 * 1000`, is moved to `failed` with reason `Remotion Lambda never reported back`.
- Use the existing `recordFailure`/transition helper.
- Bounded per run, like the other sweeps.
- The sponsorship is untouched: it keeps whatever preview it has.

Tests:
- A 7-hour-old `queued` row → `failed`.
- A 5-hour-old one → untouched.
- An `uploading` or `ready` row, whatever its age → untouched.

- [ ] Steps: failing tests → implementation → green → docs → the checks → commit `fix(site): fail renders whose Lambda callback never arrived; document the Remotion deploy`.

## Exit

Landed 2026-09-23, commits 3e6c347 → 8cccc18 on `claude/exciting-cerf-y8jun7`, CI green along the way. Nothing was deployed: no AWS, Cloudflare or Mux credentials existed in this session, and the first real render is the runbook's job (`docs/cutover-runbook.md`, section 1, decision 7).

**What shipped, and where it departs from the plan above** (the installed code, and one user decision, won over the plan's text):

- **The start routine is a plain `RequestResponse` Invoke** (`POST /2015-03-31/functions/<name>/invocations`) answering one JSON object — not the event stream and `remotion_buffer:` framing the "Facts" section describes. Those are real, but belong to `still`, not `start` (`callLambdaSyncWithoutRetry` in `@remotion/lambda-client@4.0.484`). The contract test captures the real client's request over the wire, via `AWS_ENDPOINT_URL_LAMBDA` and a local server, rather than through an injected `requestHandler`, which this path ignores.
- **Renders are submitted after payment**, from the Mollie webhook's move to `pending_approval`, inside `ctx.waitUntil`, concurrently, and at most once per sponsorship. That was the user's decision on 2026-09-23, replacing "at checkout": unpaid checkouts cost nothing, and checkout no longer waits on Lambda. The Goal line above still says "at checkout"; this section supersedes it.
- **Start failures are a `RemotionStartError` with `definite`.** A definite failure releases the claim. An ambiguous one (timeout, network, 5xx, a malformed 2xx) keeps it, so a late webhook still settles the render, and the 6 h sweep fails it otherwise.
- **The stalled sweep also covers `uploading`**, because Remotion allows 10 s per webhook delivery and retries at most twice.
- **Lambda logs at `warn`**, because at `info` Remotion writes the input props, including the signed source URL, to CloudWatch. Failure reasons are stored with URLs replaced by `<url>`.
- **Per-environment Remotion sites** (`smog-render-staging`, `smog-render-production`) share one function. The Worker has its own least-privilege IAM user (`lambda:InvokeFunction` only).
- **Bundle:** 7.41 MiB gzipped of 10 MiB (26% headroom), from 7.40. Nothing from `@remotion/*` or `@aws-sdk` is reachable from the Worker; `aws4fetch` is the only new runtime dependency.

**Tests:** the full site suite passed at 1948/1948 after the final fix wave, and the site's `lib`, `endpoints` and expiry-job suites passed 1031/1031 at the close. `apps/render` passes 4/4. Knip, `bun check`, `check-types` and `bun audit --production` are clean. Every behaviour test was seen failing first, directly or by mutation.

**Open, and why they are not this plan's:**
- **The source URL may not exist.** `…/high.mp4` needs Mux MP4 static renditions, which the legacy uploader never enabled. This is a launch-blocking check at the first staging render, with the two known fixes written down (runbook decision 7).
- **No re-render path.** A failed render, a re-edit, or a submission cut off before its claim leaves the sponsorship without a composite until an admin action exists. This is documented as a follow-up.
- **Licence.** `licenseKey` is `null`; whether a Remotion company licence applies is the owner's decision.
- **The `remotion` package-name collision** with `apps/remotion` ends when the legacy app is deleted after cutover.

## Rulings made during execution

Copied from the SDD ledger when the branch review closed. Each reads: what was decided — why — what it costs if wrong.

- T3's StartRenderInput / StartedRender are exported only if T4 imports them by name; otherwise keep them module-private (knip) — cost if wrong: a knip failure caught before commit.
- the plan's "Facts read from Remotion source" were read from npm tarballs in scratch; implementers re-read installed node_modules and the code wins — cost if wrong: none.
- carry the stale renderJob.test.ts:101-106 comment into Task 4 (it owns renderJob). Ruling: @aws-sdk root bump 3.984→3.986 accepted; Task 4's bundle re-measure is the check.
- accept the code's transport over the plan's — start uses RequestResponse Invoke (callLambdaSyncWithoutRetry), single JSON response, no event stream/framing; no eventstream-codec / serverless deps — the installed client is the authority — cost if wrong: none (wire-captured).
- aws4fetch retries: 0 (official client makes one attempt; a retried start = a second render). Accept 30 s timeout (start returns after launching); a timeout-then-release leaves at worst an ignored webhook for an unclaimed job.
- licenseKey null (client default); whether a Remotion company licence applies is a user/policy question — surfaced to user, not blocking.
- ambiguous start failures (TimeoutError, network/TypeError, HTTP 5xx/429) KEEP the claim (row stays queued) so a late webhook still settles it and Task 5's 6-hour sweep fails it otherwise; definite refusals (4xx, x-amz-function-error, type:error, invalid region, missing creds/secret) release — cost if wrong: a row lingers ≤6 h as queued.
- Remotion's Content-Length = jsonPayload.length (chars) — document in Task 5's runbook note; nothing to fix our side.
- RemotionStartError{definite}; definite = invalid region, missing creds, 4xx incl. 429, x-amz-function-error, type:error → release; ambiguous = timeout, network, 5xx, body-read failure / empty / non-JSON / missing ids after 2xx → keep claim — cost if wrong: row lingers ≤6 h.
- Task 5's stalled sweep also covers `uploading` (reason "upload to Mux never finished") — cost if wrong: a slow-but-alive upload marked failed after 6 h.
- minors 1-7,9 in fix round 1; 8 (Content-Length/undici) → Task 5 runbook note, worded as "the webhook may be rejected or fail verification".
- I1 — docs: a separate least-privilege IAM user for the Worker (lambda:InvokeFunction on remotion-render-* in eu-central-1 only); the deploy user's key stays on the operator's machine.
- I2 — the high.mp4 source likely needs Mux static renditions; cannot verify without Mux access → runbook launch-blocking check at the staging render, with the two fixes (add a "highest" static rendition to gesture assets, or a master-access flow). Code unchanged.
- all 10 minors in the same fix wave (per-environment site names for staging/production; version test extended to remotion + @remotion/cli; callback checks render state before claiming).
- concern 1 (sequential starts vs waitUntil's bounded lifetime) — controller made submissions concurrent (own row per sponsorship, no shared order) — cost if wrong: concurrent D1 inserts of distinct rows, safe.
- concern 2 (Lambda error text may quote the signed URL; stored + logged) — controller redacts http(s) URLs to <url> in failureReason, test red→green — cost if wrong: operator loses the URL (it was a credential anyway).
- concerns 3 (no re-render path) and 4 (hand-edited Mollie payment race) accepted as documented known limitations. Concern 5 runbook line fixed by controller. Concern 6: controller measured the bundle: 7.41 MiB gzipped (26% headroom).
