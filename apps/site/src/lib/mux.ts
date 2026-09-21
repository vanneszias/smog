/**
 * Mux's Video API, as `fetch`.
 *
 * **Why not `@mux/mux-node`.** The same ruling `lib/mollie.ts` records, for
 * the same two reasons and against the same budget. The Worker has 27% of
 * 10.00 MiB left and Stage 7 shares it; the SDK would buy this module one URL
 * template and a `btoa`. Stage 6 Task 6 re-measures once there are credentials
 * to point it at, and that is the moment to revisit it — not before, because a
 * measurement of an unreachable module is a measurement of nothing.
 *
 * The second reason is sharper than the first and is why the credentials are
 * read *inside* the function rather than at module scope. A client built at
 * module scope from an unset variable is dead on import:
 * `createMollieClient({ apiKey: "" })` throws in its constructor and killed a
 * whole `next build` here, and `new Mux({ tokenId, tokenSecret })` has exactly
 * the same shape — `apps/server/src/services/mux.ts` constructs it lazily and
 * throws when the pair is missing, which is the behaviour transcribed below.
 * An unset credential must be an error on the one request that needed it, not
 * a Worker that will not boot.
 *
 * **The secrets.** The two token variables are read on exactly two lines of
 * this file — `process.env.MUX_TOKEN_ID` and `process.env.MUX_TOKEN_SECRET`,
 * both inside `authorizationOrThrow` — and leave it only inside an
 * `Authorization: Basic` header. Neither is interpolated into a URL, a body, a log line or an error
 * message, and this file never logs at all — the caller does that, from
 * messages constructed here that are safe to print. Neither name is restated
 * in any other string, so that
 *
 *     grep -rn "MUX_TOKEN" apps/site/src/lib | grep -v "process.env.MUX_TOKEN"
 *
 * prints nothing and the two readers are provable rather than asserted.
 * (`src/endpoints/render.int.test.ts` names them a third time, to put stubs in
 * the environment and take them out again; the scope above is `src/lib` so the
 * claim is about the code that *reads* a credential rather than about the test
 * that sets a fake one.)
 *
 * **Nothing here is proven against Mux.** There are no credentials in this
 * project (see the plan's "BLOCKED ON CREDENTIALS"), so every test that
 * reaches this module answers it with a local fake. A fake proves the shape of
 * a protocol and never the provider's behaviour — Stage 4's Google strategy is
 * the precedent and the warning.
 */

const MUX_API_BASE = "https://api.mux.com/video/v1";

/**
 * A Mux asset as `createMuxAssetFromUrl` reports it.
 *
 * Not exported, for the reason `lib/mollie.ts` gives: knip fails
 * `bun release:check` on an exported symbol nothing imports, and the one
 * caller reads the fields off the result rather than naming the type. It is
 * still this module's contract; it is spelled out in the return type instead.
 *
 * `playbackId` is nullable because Mux's answer genuinely can be. An asset
 * created with `playback_policy: ["public"]` normally comes back with one, but
 * the caller must not assume it: a playback id is what a public page plays,
 * and an asset without one is a video that will never play however healthy
 * Mux says it is. `status` is Mux's own word — `preparing` on the happy path,
 * because ingest is asynchronous and a freshly created asset is never `ready`.
 */
interface MuxAsset {
  assetId: string;
  playbackId: null | string;
  status: string;
}

function authorizationOrThrow(): string {
  const tokenId = process.env.MUX_TOKEN_ID?.trim();
  const tokenSecret = process.env.MUX_TOKEN_SECRET?.trim();

  if (!(tokenId && tokenSecret)) {
    throw new Error("[mux] The Mux API credentials are missing.");
  }

  return `Basic ${btoa(`${tokenId}:${tokenSecret}`)}`;
}

/**
 * Mux's answer, parsed, with a non-JSON body treated as a failure.
 *
 * Never a fallback to a default, for the reason `lib/mollie.ts` spells out: a
 * Cloudflare or Mux error page is HTML, sometimes with a 200 as a cached edge
 * response, and a `catch` that returned `{}` here is how a caller ends up
 * recording an asset id of `undefined` for a video somebody paid for.
 *
 * The body is deliberately not quoted into the error. An intercepting proxy's
 * error page can echo the request that produced it, headers included, and this
 * module's request carries the token pair.
 */
async function parseMuxJson(
  response: Response,
  what: string
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `[mux] ${what} returned a non-JSON body (HTTP ${response.status}, content-type ${response.headers.get("content-type") ?? "unknown"}).`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[mux] ${what} returned a non-JSON body: expected an object (HTTP ${response.status}).`
    );
  }

  return parsed as Record<string, unknown>;
}

/** Mux's error objects carry `error.messages`, a list of strings. */
function refusalMessage(body: Record<string, unknown>): string {
  const error = body.error as { messages?: unknown } | undefined;
  const messages = error?.messages;

  if (!Array.isArray(messages)) {
    return "no detail given";
  }

  const printable = messages.filter(
    (message): message is string => typeof message === "string"
  );

  return printable.length > 0 ? printable.join("; ") : "no detail given";
}

/** The first public playback id on an asset, or `null` if Mux sent none. */
function publicPlaybackId(asset: Record<string, unknown>): null | string {
  const ids = asset.playback_ids;

  if (!Array.isArray(ids)) {
    return null;
  }

  for (const entry of ids) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }

    const { id, policy } = entry as { id?: unknown; policy?: unknown };

    if (typeof id === "string" && id !== "" && policy === "public") {
      return id;
    }
  }

  return null;
}

/**
 * Asks Mux to ingest a video from a URL, and reports the asset it made.
 *
 * **This is the irreversible step of the whole callback**, which is why the
 * caller claims the job before reaching it: Mux bills for an asset every month
 * until somebody deletes it, and an asset nothing references is an asset
 * nobody can name. Everything that can refuse the work is done before this
 * call, and nothing after it can undo it.
 *
 * A throw from here means **no asset was created** — the request was refused,
 * or never arrived, or came back unreadable — so the caller may safely retry.
 * That is why a refusal is not split into "Mux's definite answer" and "Mux
 * could not be asked" the way `lib/mollie.ts` splits a payment read: there,
 * a 404 is an answer about a payment that exists independently of the request;
 * here, every non-2xx is an asset that was not made, and the only question is
 * whether to ask again.
 *
 * `playback_policy: ["public"]` matches what this product already creates —
 * `packages/api/src/lib/mux.ts` sets the same on every upload — because the
 * gesture videos it replaces are played by an unauthenticated public page.
 *
 * @throws If the credentials are unset, or Mux refuses, answers with a
 *   non-JSON body, or answers with an asset that has no id.
 */
export async function createMuxAssetFromUrl(
  sourceUrl: string
): Promise<MuxAsset> {
  const authorization = authorizationOrThrow();

  const response = await fetch(`${MUX_API_BASE}/assets`, {
    body: JSON.stringify({
      input: [{ url: sourceUrl }],
      playback_policy: ["public"],
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  // Parsed before the status is consulted, because Mux's own explanation of a
  // refusal is in the body.
  const body = await parseMuxJson(response, "Creating an asset");

  if (!response.ok) {
    throw new Error(
      `[mux] Creating an asset was refused (HTTP ${response.status}): ${refusalMessage(body)}`
    );
  }

  const data = body.data;

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("[mux] Mux answered without an asset.");
  }

  const asset = data as Record<string, unknown>;
  const assetId = asset.id;

  if (typeof assetId !== "string" || assetId === "") {
    throw new Error("[mux] Mux created an asset with no id.");
  }

  // `status` is reported rather than demanded. A missing one is not a reason
  // to throw — the asset exists and is billable by now, so throwing would ask
  // the caller to retry a step that would make a second one. The caller
  // decides what an unusable asset means; see `endpoints/render.ts`.
  const status = typeof asset.status === "string" ? asset.status : "unknown";

  return { assetId, playbackId: publicPlaybackId(asset), status };
}
