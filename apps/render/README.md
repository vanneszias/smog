# render

The Remotion compositions `apps/site` renders on **Remotion Lambda**, and the
scripts that deploy them to AWS, region **`eu-central-1`**.

There is one composition, `SponsoredVideo` (the id is
`SPONSORED_VIDEO_COMPOSITION_ID` in `@smog/types/render`). It plays the
sponsored video and fades the sponsor's name and logo in over its end. Its
input props are `SponsoredVideoInputProps` from the same module, and
`src/types/schema.ts` checks at compile time that the zod schema accepts
exactly those props. A rename on either side fails `check-types`.

`apps/site` submits one render per sponsorship **once it is paid for**: the
Mollie webhook's move from `pending_payment` to `pending_approval` asks for it
(`apps/site/src/lib/paidRenders.ts`), never checkout. The composite therefore
exists only for paid sponsorships, and an administrator reviews it in the
approval queue as before.

**The workspace is named `render`, and `apps/remotion` is named `remotion`** —
the same name as the `remotion` npm package. Filter this workspace with
`bun -F render …`; `bun -F remotion …` means the legacy `apps/remotion`, not
the package and not this app.

The compositions are a copy of `apps/remotion`'s. The legacy Docker render
stack still runs `apps/remotion` until the cutover's 30-day hold ends
(`docs/cutover-runbook.md`, section 5), and the copy ends when `apps/remotion`
is deleted. Until then, change a composition in both places, or here only if
the legacy stack no longer matters.

## Scripts

```bash
bun -F render dev:studio        # Remotion Studio, to preview the composition
bun -F render bundle            # webpack bundle into build/ (what the site deploy uploads)
bun -F render check-types
bun -F render test
bun -F render deploy:function           # needs the deploy credentials, see below
bun -F render deploy:site:staging       # needs the deploy credentials, see below
bun -F render deploy:site:production    # needs the deploy credentials, see below
```

Every `remotion` and `@remotion/*` package is pinned to one exact version,
without a caret. Remotion refuses to run with mixed versions, and the Lambda
function refuses a render request from a different version.

## One-time AWS setup

Follow Remotion's [Lambda setup](https://www.remotion.dev/docs/lambda/setup),
in the AWS account that pays for rendering. There are **two IAM users**, and
they must not be merged:

1. **Role policy.** Create an IAM policy named `remotion-lambda-policy` whose
   JSON is the output of `npx remotion lambda policies role` (run from this
   directory, which prints the policy for the installed version).
2. **Role.** Create an IAM role named exactly `remotion-lambda-role`, for the
   Lambda service, with that policy attached. The deployed function runs as
   this role.
3. **The deploy user** (for example `remotion-deploy`). Give it an inline
   policy whose JSON is the output of `npx remotion lambda policies user`,
   and create an access key for it. This is the identity that runs
   `deploy:function` and `deploy:site:*`. **Its key stays on the operator's
   machine** — export it in your shell as `REMOTION_AWS_ACCESS_KEY_ID` and
   `REMOTION_AWS_SECRET_ACCESS_KEY` before running the deploy scripts, never
   commit it, and **never give it to the Worker**: it can create and delete
   functions, buckets and sites.
4. **The Worker user** (for example `smog-site-render-invoke`). A second IAM
   user with nothing but this inline policy (put your account id in):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "lambda:InvokeFunction",
         "Resource": "arn:aws:lambda:eu-central-1:<account-id>:function:remotion-render-*"
       }
     ]
   }
   ```

   Create an access key for it. **This** key becomes the `apps/site` Worker
   secrets `REMOTION_AWS_ACCESS_KEY_ID` and `REMOTION_AWS_SECRET_ACCESS_KEY`
   (`wrangler secret put`, per environment).

   Why this is enough: the Worker makes exactly one AWS call, a synchronous
   `Invoke` of the start routine (`apps/site/src/lib/remotionLambda.ts`).
   Everything the render then does — S3 reads and writes, invoking the
   renderer functions, writing the output — runs as `remotion-lambda-role`,
   not as the caller. The input props travel inline in the start payload, so
   the Worker never touches S3 either. A leaked Worker key can therefore
   start renders (which costs money, and is worth rotating for) and do
   nothing else: no reading outputs, no deleting, no changing the function.
5. Optionally, check the deploy user: `npx remotion lambda policies validate`.
6. **Concurrency.** A new AWS account's Lambda concurrency quota can be far
   below what Remotion needs for one render, and a throttled invoke is
   refused. Check it with `npx remotion lambda quotas` and ask AWS for an
   increase (`npx remotion lambda quotas increase`) before the first staging
   render.

Everything lives in **`eu-central-1`**. The deploy scripts pass
`--region=eu-central-1` themselves, and the site's `REMOTION_REGION` var is
the same region.

## Deploy, in order — staging first

1. **The function**, once per Remotion version:

   ```bash
   bun -F render deploy:function
   ```

   It deploys with 3009 MB of memory, a 240 s timeout and 2048 MB of disk,
   and prints `Deployed as <function name>` (or `Already exists as …`). The
   name encodes the version and the sizes, e.g.
   `remotion-render-4-0-484-mem3009mb-disk2048mb-240sec`.

   **The function is shared by staging and production.** There is one per
   Remotion version and size, and both environments' `REMOTION_FUNCTION_NAME`
   name it, so a function redeploy (a version bump) affects both
   environments at once.

2. **The site** (the bundle of these compositions, uploaded to S3), **per
   environment**:

   ```bash
   bun -F render deploy:site:staging      # --site-name=smog-render-staging
   bun -F render deploy:site:production   # --site-name=smog-render-production
   ```

   Each uploads under its own fixed name, so a redeploy overwrites that
   environment's site and keeps its URL, and a composition change can be
   tried on staging without touching production. Each prints its **serve
   URL**
   (`https://remotionlambda-eucentral1-….s3.eu-central-1.amazonaws.com/sites/smog-render-staging/index.html`,
   and the same with `smog-render-production`).

3. **Where they go.** The function name becomes the `apps/site` var
   `REMOTION_FUNCTION_NAME` in both environments, and each environment's
   serve URL becomes its own `REMOTION_SERVE_URL`, in that environment's
   `vars` in `apps/site/wrangler.jsonc`. All are non-secret. Until they are
   set, the site's render transport logs and does nothing.
   [`docs/deployment-checklist.md`](../../docs/deployment-checklist.md) and
   [`docs/cutover-runbook.md`](../../docs/cutover-runbook.md) (section 1,
   decision 7) hold the full operator steps: staging's vars, one real staging
   render that must reach `ready`, then production's.

## When to redeploy

- **The site, on every composition change** (anything under `src/`):
  staging first, then production once it renders. Lambda renders whatever
  bundle is at the serve URL. With the fixed site names, the URLs do not
  change, so the Worker vars do not need to be updated.
- **The function, on every Remotion version bump.** The function name
  contains the version, so a bump means a new function name, which is a new
  `REMOTION_FUNCTION_NAME` in **both** environments. Redeploy both sites
  after the function, so each bundle is on the function's version.
- **A version bump must move `apps/site`'s pinned Remotion payload version
  too.** The site builds Lambda's start payload itself, and the function
  refuses a payload from another version. `apps/site`'s contract test fails
  until both sides agree, so bump every `remotion` and `@remotion/*` pin here
  and in `apps/site` in the same change.

## Local renders

`remotion still` and `remotion render` need a headless Chrome, which Remotion
downloads on first use. Pass `--props` with the input props:

```bash
bunx remotion still src/index.ts SponsoredVideo out/still.png --frame=-1 \
  --props='{"videoSrc":"https://…/video.mp4","sponsorName":"SMOG"}'
```

`--frame=-1` is the last frame, where the sponsor overlay is fully shown.

## When a render goes wrong

- **Where to look.** The Worker's side is in `bunx wrangler tail --env=<env>`
  (from `apps/site`). A healthy paid order logs
  `[mollie] Payment <id> moved <n> of <n> sponsorships to pending_approval`,
  then one `[renderJob] Submitted render <jobId> for sponsorship <id>
  (Remotion render <renderId>)` per sponsorship; the callback minutes later
  logs nothing on success, and `[render] Render job <jobId> failed: <reason>`
  on a failure. Other lines to recognise: `[renderJob] No render was
  submitted …` (unconfigured, or a render already in hand), `[renderJob]
  Failed to submit render …` (Lambda refused the start),
  `[renderJob] Render <jobId> for sponsorship <id> may have started …` (the
  answer was lost; the callback or the sweep settles it), `[render] Ignored a
  callback for render <jobId>, already <state>`, and the hourly
  `[expireSponsorships] Failed <n> stalled render(s)`.
- **Lambda's side** is in CloudWatch, in the function's log group
  `/aws/lambda/<REMOTION_FUNCTION_NAME>` in `eu-central-1` (the group
  `deploy:function` creates, `LOG_GROUP_PREFIX` + the function name in
  `@remotion/lambda`, kept for 14 days by default). The start, launch and
  renderer invocations are all the same function, so one render's logs are
  all there. Remotion's Lambda troubleshooting docs cover reading them.
- **A `failed` render is not re-submitted automatically**, and there is no
  operator action that re-submits one today: renders are asked for only on
  the Mollie webhook's move to `pending_approval`, which happens once per
  sponsorship, and a replayed delivery is refused by its claim. This is a
  known limitation. The sponsorship keeps its uncomposed preview; an
  administrator can still approve it, and the gesture page then plays the
  gesture's own video. A re-render needs a code change (an admin action that
  calls `submitRenderJob` for the sponsorship), recorded as a follow-up.
- **A sponsorship with no render row at all** is the other way a paid
  sponsorship ends up without a composite: the platform stops `waitUntil`
  work a bounded time after the webhook is answered, and a submission cut off
  before its claim is written leaves no `renders` row and nothing for the
  sweep to fail. Its only trace is a missing `[renderJob] Submitted render …`
  line for that sponsorship; the same follow-up covers it.
- **Where the signed source URL can still end up.** Not in the Worker's logs
  or in CloudWatch at `logLevel: "warn"`, but in two places this app does
  not control: Remotion's private S3 progress file for the render
  (`renderMetadata.inputProps`), and any Lambda error text that quotes it,
  which the callback stores as the render's `failureReason` with every URL
  replaced by `<url>` (`endpoints/render.ts`, `withoutUrls`). The
  sensitivity is low: the URL expires after two hours, and it is for a
  public playback id that Mux serves without a token anyway.

