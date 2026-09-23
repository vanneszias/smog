# render

The Remotion compositions `apps/site` renders on **Remotion Lambda**, and the
scripts that deploy them to AWS, region **`eu-central-1`**.

There is one composition, `SponsoredVideo` (the id is
`SPONSORED_VIDEO_COMPOSITION_ID` in `@smog/types/render`). It plays the
sponsored video and fades the sponsor's name and logo in over its end. Its
input props are `SponsoredVideoInputProps` from the same module, and
`src/types/schema.ts` checks at compile time that the zod schema accepts
exactly those props. A rename on either side fails `check-types`.

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
bun -F render deploy:function   # needs AWS credentials, see below
bun -F render deploy:site       # needs AWS credentials, see below
```

Every `remotion` and `@remotion/*` package is pinned to one exact version,
without a caret. Remotion refuses to run with mixed versions, and the Lambda
function refuses a render request from a different version.

## One-time AWS setup

Follow Remotion's [Lambda setup](https://www.remotion.dev/docs/lambda/setup),
in the AWS account that pays for rendering. In short:

1. **Role policy.** Create an IAM policy named `remotion-lambda-policy` whose
   JSON is the output of `npx remotion lambda policies role` (run from this
   directory, which prints the policy for the installed version).
2. **Role.** Create an IAM role named exactly `remotion-lambda-role`, for the
   Lambda service, with that policy attached. The deployed function runs as
   this role.
3. **User.** Create an IAM user (for example `remotion-user`). Give it an
   inline policy whose JSON is the output of `npx remotion lambda policies
   user`. Create an access key for it.
4. **Credentials.** That one access key is used in two places:
   - by you, locally, to run the deploy scripts. Export it in your shell as
     `REMOTION_AWS_ACCESS_KEY_ID` and `REMOTION_AWS_SECRET_ACCESS_KEY`
     before running them. Never commit it;
   - by the site, which submits renders with it. The same two names are the
     `apps/site` Worker secrets `REMOTION_AWS_ACCESS_KEY_ID` and
     `REMOTION_AWS_SECRET_ACCESS_KEY` (`wrangler secret put`, per
     environment).
5. Optionally, check it: `npx remotion lambda policies validate`.

Everything lives in **`eu-central-1`**. The deploy scripts pass
`--region=eu-central-1` themselves, and the site's `REMOTION_REGION` var is
the same region.

## Deploy, in order

1. **The function**, once per Remotion version:

   ```bash
   bun -F render deploy:function
   ```

   It deploys with 3009 MB of memory, a 240 s timeout and 2048 MB of disk,
   and prints `Deployed as <function name>` (or `Already exists as …`). The
   name encodes the version and the sizes, e.g.
   `remotion-render-4-0-484-mem3009mb-disk2048mb-240sec`.

2. **The site** (the bundle of these compositions, uploaded to S3):

   ```bash
   bun -F render deploy:site
   ```

   It uploads under the fixed name `smog-render`, so a redeploy overwrites
   the same site and keeps the same URL. It prints the **serve URL**
   (`https://remotionlambda-eucentral1-….s3.eu-central-1.amazonaws.com/sites/smog-render/index.html`).

3. **Where they go.** The function name becomes the `apps/site` var
   `REMOTION_FUNCTION_NAME` and the serve URL becomes `REMOTION_SERVE_URL`, in
   each environment's `vars` in `apps/site/wrangler.jsonc`. Both are
   non-secret. Until they are set, the site's render transport logs and does
   nothing. [`docs/deployment-checklist.md`](../../docs/deployment-checklist.md)
   and [`docs/cutover-runbook.md`](../../docs/cutover-runbook.md) (section 1,
   decision 7) hold the full operator steps.

## When to redeploy

- **The site, on every composition change** (anything under `src/`). Lambda
  renders whatever bundle is at the serve URL. With the fixed site name, the
  URL does not change, so the Worker vars do not need to be updated.
- **The function, on every Remotion version bump.** The function name
  contains the version, so a bump means a new function name, which is a new
  `REMOTION_FUNCTION_NAME`. Redeploy the site after the function, so the
  bundle and the function are on the same version.
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
