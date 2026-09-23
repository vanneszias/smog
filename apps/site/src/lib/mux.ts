/**
 * Mux's Video API, as `fetch`.
 *
 * **Why not `@mux/mux-node`.** The same reasoning `lib/mollie.ts` records, for
 * the same two reasons and against the same budget. The Worker had 27% of 10.00
 * MiB left when this was decided; the SDK would buy this module one URL
 * template and a `btoa`. Re-measure once there are credentials to point it at;
 * that is the moment to revisit it — not before, because a measurement of an
 * unreachable module is a measurement of nothing.
 *
 * The second reason is sharper than the first and is why the credentials are
 * read *inside* the function rather than at module scope. A client built at
 * module scope from an unset variable is dead on import:
 * `createMollieClient({ apiKey: "" })` throws in its constructor and killed a
 * whole `next build` here, and `new Mux({ tokenId, tokenSecret })` has exactly
 * the same shape — so the pair is read lazily below, and a missing one throws.
 * An unset credential must be an error on the one request that needed it, not
 * a Worker that will not boot.
 *
 * **The secrets.** Every Mux credential this application holds is read in this
 * file and nowhere else, which is the property that makes an audit a grep
 * rather than a reading. The two API tokens are read on exactly two lines —
 * `process.env.MUX_TOKEN_ID` and `process.env.MUX_TOKEN_SECRET`, both inside
 * `authorizationOrThrow` — and leave it only inside an
 * `Authorization: Basic` header. The signing key pair
 * (`MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`) is read on exactly two
 * more, inside `signingKeyOrThrow`, and its private half leaves this file only
 * as an RSA signature. Neither is interpolated into a URL, a body, a log line or an error
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
 * repository, so every test that reaches this module answers it with a local
 * fake. A fake proves the shape of a protocol and never the provider's
 * behaviour — the Google strategy's tests are the precedent and the warning.
 */

const MUX_API_BASE = "https://api.mux.com/video/v1";

/**
 * How long one call to Mux may take before it is abandoned.
 *
 * Workers `fetch` has no default timeout, and a call that never answers holds
 * the request — or, from a job, the whole queue run — until the platform
 * kills it, which strands every job that run had claimed. Ten seconds is the
 * value `endpoints/oauth.ts` already uses for the same reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;

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
 * A refusal from here means **no asset was created**: every non-2xx is an
 * asset that was not made, and the only question is whether to ask again.
 * That is why a refusal is not split into "Mux's definite answer" and "Mux
 * could not be asked" the way `lib/mollie.ts` splits a payment read: there,
 * a 404 is an answer about a payment that exists independently of the request.
 *
 * **A timeout is the exception, and it is not a refusal.** When
 * `REQUEST_TIMEOUT_MS` runs out, `fetch` rejects with a `TimeoutError`
 * without saying whether Mux received the request — it may have created the
 * asset and merely not answered in time. So an asset may exist that nothing
 * here recorded. `passthrough` is what makes such an asset findable: Mux
 * stores it verbatim on the asset (a string of at most 255 characters), and
 * the caller passes an identifier of the render — never a name, an email or
 * anything else about a person — so an orphan can be traced to the render
 * that asked for it. `endpoints/render.ts` logs that possibility on a
 * timeout.
 *
 * `playback_policy: ["public"]` matches every other gesture video, because the
 * gesture videos it replaces are played by an unauthenticated public page.
 *
 * @throws If the credentials are unset, or Mux refuses, answers with a
 *   non-JSON body, answers with an asset that has no id, or does not answer
 *   within `REQUEST_TIMEOUT_MS` (a `TimeoutError`; see above).
 */
export async function createMuxAssetFromUrl(
  sourceUrl: string,
  passthrough: string
): Promise<MuxAsset> {
  const authorization = authorizationOrThrow();

  const response = await fetch(`${MUX_API_BASE}/assets`, {
    body: JSON.stringify({
      input: [{ url: sourceUrl }],
      passthrough,
      playback_policy: ["public"],
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

/*
 * ---------------------------------------------------------------------------
 * The source URL a render container is given
 * ---------------------------------------------------------------------------
 */

const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/**
 * How long an issued source URL is good for.
 *
 * Two hours, and the two directions it is squeezed from are worth stating.
 * Shorter is safer, and the URL is only ever handed to something that is about
 * to render: a submission is picked up by Remotion Lambda in seconds, and a
 * render takes minutes. Longer is what covers AWS queueing a job behind a
 * concurrency limit and retrying it, where a URL that expired in the queue is
 * a render that fails for a reason nothing in the failure report explains.
 *
 * `mux.test.ts` pins this as arithmetic rather than as a range, so widening it
 * to a day — or to a hundred years, which is what a mutation does — is a test
 * failure and not a judgement call.
 */
const SOURCE_URL_TTL_SECONDS = 2 * 60 * 60;

const MS_PER_SECOND = 1000;

/** The PEM line wrapping, for the `atob` of a key that arrives base64-wrapped. */
const PEM_BODY = /-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/;

/**
 * A short-lived, signed URL for a Mux video, and when it stops working.
 *
 * Not exported, for the reason the asset type above gives: knip fails
 * `bun release:check` on an exported symbol nothing imports, and the callers
 * read the two fields off the result.
 */
interface MuxSourceUrl {
  /** Unix milliseconds, so a caller can log or store it without re-deriving. */
  expiresAt: number;
  url: string;
}

function bytesToBinary(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function binaryToBytes(binary: string): Uint8Array<ArrayBuffer> {
  // Allocated rather than `Uint8Array.from`, whose type is
  // `Uint8Array<ArrayBufferLike>` and which `crypto.subtle` will not take.
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/** base64url, which is what a JWT's three segments are encoded in. */
function base64Url(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlJson(value: Record<string, number | string>): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * The signing key pair, or an error naming what is missing.
 *
 * **The value is never in the message.** A missing credential is logged by
 * whoever catches this, and a log line is the one place a private key must not
 * reach; `mux.test.ts` asserts the absence directly rather than trusting the
 * sentence below to stay careful.
 */
function signingKeyOrThrow(): { id: string; privateKey: string } {
  const id = process.env.MUX_SIGNING_KEY_ID?.trim();
  const privateKey = process.env.MUX_SIGNING_KEY_PRIVATE?.trim();

  if (!(id && privateKey)) {
    throw new Error(
      "[mux] MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE must both be set to issue a source URL."
    );
  }

  return { id, privateKey };
}

/**
 * The DER bytes of a PKCS#8 private key, from either spelling of it.
 *
 * Mux hands a signing key over **base64-wrapped**, so that is what a secret
 * usually holds; an operator pasting the PEM itself is the likelier of the two
 * mistakes and costs nothing to accept. Guessing between them is a `-----BEGIN`
 * test rather than a heuristic on the string's shape.
 */
function pkcs8Bytes(value: string): Uint8Array<ArrayBuffer> {
  const pem = value.includes("-----BEGIN") ? value : atob(value);
  const body = PEM_BODY.exec(pem)?.[1];

  if (body === undefined) {
    throw new Error(
      "[mux] MUX_SIGNING_KEY_PRIVATE is not a PEM private key, base64-wrapped or otherwise."
    );
  }

  return binaryToBytes(atob(body.replaceAll(/\s/g, "")));
}

/**
 * A short-lived signed URL for a Mux playback id, for a render container to
 * fetch the source video from.
 *
 * ## What this is, and the one thing it is not
 *
 * A Mux playback token: an RS256 JWT whose `sub` is the playback id, whose
 * `aud` is `"v"` (playback, as opposed to a thumbnail, a GIF or a storyboard),
 * and whose `exp` this application chooses. The key id travels in the JWT
 * header so Mux can find the public half.
 *
 * **It is only enforced for a playback id whose policy is `signed`.** Every
 * asset this product has today is `public` — the gesture pages play them
 * unauthenticated, and `createMuxAssetFromUrl` above creates the composed ones
 * the same way — and Mux serves a public playback id to anyone who asks,
 * token or no token. So on today's data the expiry is real, minted and
 * verifiable, and Mux will not be the thing applying it.
 *
 * That is recorded rather than worked around because it decides what
 * `GET /api/mux/source/:id` is actually protecting, and the honest answer is:
 * not the video, which the public gesture page already streams. What the
 * endpoint protects is the *enumeration* — which playback ids exist and which
 * gesture each belongs to — and it is the seam that becomes load-bearing the
 * moment a source moves to a signed policy. **That decision is separate**, and
 * it is a `playback_policy` on the asset rather than a change here.
 *
 * `now` is a parameter rather than read inside, for the reason
 * `lib/sponsorOverlay.ts` gives about its own clock: a caller that mints two
 * URLs should be able to say they expire together, and a test should be able
 * to assert arithmetic rather than race a clock.
 *
 * @throws If the signing key is unset or is not a PEM private key.
 */
export async function signedMuxSourceUrl(
  playbackId: string,
  now: number
): Promise<MuxSourceUrl> {
  const { id, privateKey } = signingKeyOrThrow();
  const expiresAt =
    Math.floor(now / MS_PER_SECOND) * MS_PER_SECOND +
    SOURCE_URL_TTL_SECONDS * MS_PER_SECOND;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Bytes(privateKey),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"]
  );

  const signed = [
    base64UrlJson({ alg: "RS256", kid: id, typ: "JWT" }),
    base64UrlJson({
      aud: "v",
      exp: expiresAt / MS_PER_SECOND,
      kid: id,
      sub: playbackId,
    }),
  ].join(".");

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signed)
  );

  const token = `${signed}.${base64Url(new Uint8Array(signature))}`;

  // `high.mp4` rather than an HLS playlist: the consumer is a Remotion
  // composition, which decodes a progressive file and cannot read `.m3u8`.
  return {
    expiresAt,
    url: `${MUX_STREAM_ORIGIN}/${playbackId}/high.mp4?token=${token}`,
  };
}

/*
 * ---------------------------------------------------------------------------
 * The back half of an asset's life: is it playable, and is it gone
 * ---------------------------------------------------------------------------
 */

/** Mux's answer when it has never heard of the asset, or no longer has it. */
const NOT_FOUND = 404;

/**
 * What Mux currently says about an asset this application created.
 *
 * Not exported, for the reason the types above give: knip fails
 * `bun release:check` on an exported symbol nothing imports, and the caller
 * reads the two fields off the result.
 */
interface MuxAssetState {
  playbackId: null | string;
  /** Mux's own word — `preparing`, `ready` or `errored`. */
  status: string;
}

/**
 * What Mux says about an asset now, or `null` if Mux does not have it.
 *
 * **This is a sweep, not a poll, and the difference is the whole design.**
 * `asset.ready` is asynchronous: `createMuxAssetFromUrl` returns while the
 * asset is still `preparing`, and minutes later it is either playable or
 * `errored`. A Worker request cannot wait for that — it has nowhere to wait,
 * because the callback has to answer Lambda — so nothing in this application
 * ever loops on this function. `jobs/expireSponsorships.ts` asks once, from a
 * scheduled job, about assets it already knows the id of.
 *
 * **A 404 is an answer, not a failure**, and it is the one case that has to be
 * distinguished from every other refusal. An asset Mux does not have is an
 * asset that will never play and that nobody is being billed for; a 401, a 429
 * or a 503 says nothing at all about the asset and must not be read as "it is
 * gone", because acting on that would throw away a composite that is alive.
 * So `null` means *Mux answered, and it does not have this asset*, and
 * everything else that is not a success throws.
 *
 * @throws If the credentials are unset, or Mux refuses with anything but a
 *   404, or answers with a non-JSON body.
 */
export async function readMuxAsset(
  assetId: string
): Promise<null | MuxAssetState> {
  const authorization = authorizationOrThrow();

  const response = await fetch(
    `${MUX_API_BASE}/assets/${encodeURIComponent(assetId)}`,
    {
      headers: { Authorization: authorization },
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (response.status === NOT_FOUND) {
    return null;
  }

  const body = await parseMuxJson(response, "Reading an asset");

  if (!response.ok) {
    throw new Error(
      `[mux] Reading an asset was refused (HTTP ${response.status}): ${refusalMessage(body)}`
    );
  }

  const data = body.data;

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("[mux] Mux answered without an asset.");
  }

  const asset = data as Record<string, unknown>;

  return {
    playbackId: publicPlaybackId(asset),
    status: typeof asset.status === "string" ? asset.status : "unknown",
  };
}

/**
 * Deletes an asset, and treats one that is already gone as deleted.
 *
 * **The irreversible step of the expiry, and the reason the job is ordered the
 * way it is.** A deleted Mux asset cannot be restored — the composite would
 * have to be rendered again, which costs Lambda time and a sponsor's overlay
 * that may no longer exist — so `jobs/expireSponsorships.ts` reads the
 * sponsorship back out of the database and refuses to call this until it says
 * the sponsorship has left the public page.
 *
 * **A 404 is success.** The operation asked for is "this asset is not on
 * Mux's books any more", and an asset Mux has never heard of satisfies it.
 * That is not a nicety: the asset may be gone because an operator deleted it
 * by hand, or because a previous run of the job deleted it and died before
 * recording that it had. Treating that as a failure would mean the job could
 * never finish for that sponsorship and would ask Mux to delete it again every
 * day, for ever. The job is resumable precisely because this call is.
 *
 * Every other refusal throws, and the caller leaves the asset id recorded so
 * the next run tries again. A 401 is not a missing asset.
 *
 * @throws If the credentials are unset, or Mux refuses with anything but a
 *   404, or answers a refusal with a non-JSON body.
 */
export async function deleteMuxAsset(assetId: string): Promise<void> {
  const authorization = authorizationOrThrow();

  const response = await fetch(
    `${MUX_API_BASE}/assets/${encodeURIComponent(assetId)}`,
    {
      headers: { Authorization: authorization },
      method: "DELETE",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  // Mux answers a successful delete `204 No Content`, so the body is not read
  // on the way out: `parseMuxJson` would turn an empty body into a throw and
  // report a completed deletion as a failure.
  if (response.ok || response.status === NOT_FOUND) {
    return;
  }

  const body = await parseMuxJson(response, "Deleting an asset");

  throw new Error(
    `[mux] Deleting an asset was refused (HTTP ${response.status}): ${refusalMessage(body)}`
  );
}
