/**
 * `crypto.subtle` with real RSA keys, and no DOM at all.
 *
 * @vitest-environment node
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createMuxAssetFromUrl,
  deleteMuxAsset,
  readMuxAsset,
  signedMuxSourceUrl,
} from "@/lib/mux";

/** Two hours, the window `lib/mux.ts` mints. Pinned here as a literal. */
const TTL_SECONDS = 2 * 60 * 60;
const MS_PER_SECOND = 1000;

/** A fixed instant, so `exp` is arithmetic rather than a race with the clock. */
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

const PLAYBACK_ID = "pbSourceForTestsOnly001";

/**
 * Stand-ins, never real credentials. The key below is generated in this
 * process, used by this file and thrown away — there is no Mux signing key in
 * this repository, and one committed to a repository would be a finding rather
 * than a fixture.
 */
const STUB_KEY_ID = "signing-key-for-tests-only";

const ORIGINAL_KEY_ID = process.env.MUX_SIGNING_KEY_ID;
const ORIGINAL_KEY_PRIVATE = process.env.MUX_SIGNING_KEY_PRIVATE;

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` leaves the string `"undefined"` behind, and
 * `vitest.config.mts` sets `isolate: false`, so every file this worker runs
 * afterwards shares this process. `endpoints/render.int.test.ts` documents the
 * same hazard at length.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
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

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");

  return binaryToBytes(
    atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  );
}

function decodeSegment(value: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(value))
  ) as Record<string, unknown>;
}

/** The JWT out of a `?token=` query parameter. */
function tokenOf(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

/**
 * The short-lived source URL the render container is given.
 *
 * **Nothing here is evidence about Mux.** There are no Mux credentials in this
 * project, so the signing key below is one this file generates. What the tests
 * prove is that the token this application mints is a real RS256 JWT over
 * claims that include an expiry and the playback id it was asked for — which is
 * the half that is this application's to get right. Whether Mux accepts it is
 * for a deployed environment to show, and a fake proves the shape of a protocol
 * and never a provider's behaviour.
 */
describe("the Mux source URL", () => {
  let publicKey: CryptoKey;

  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
      {
        hash: "SHA-256",
        modulusLength: 2048,
        name: "RSASSA-PKCS1-v1_5",
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ["sign", "verify"]
    );

    publicKey = pair.publicKey;

    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey)
    );
    const body = btoa(bytesToBinary(pkcs8)).replace(/(.{64})/g, "$1\n");
    const pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;

    // Base64-wrapped, which is how Mux hands a signing key over.
    process.env.MUX_SIGNING_KEY_PRIVATE = btoa(pem);
    process.env.MUX_SIGNING_KEY_ID = STUB_KEY_ID;
  });

  afterAll(() => {
    restoreEnv("MUX_SIGNING_KEY_ID", ORIGINAL_KEY_ID);
    restoreEnv("MUX_SIGNING_KEY_PRIVATE", ORIGINAL_KEY_PRIVATE);
  });

  it("boots with the key this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that generated no key would look green having proven nothing.
    expect(process.env.MUX_SIGNING_KEY_ID).toBe(STUB_KEY_ID);
    expect(process.env.MUX_SIGNING_KEY_PRIVATE ?? "").not.toBe("");
  });

  it("issues a source URL for a gesture's playback id", async () => {
    const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
    const url = new URL(source.url);

    expect(url.origin).toBe("https://stream.mux.com");
    // `high.mp4` and not `.m3u8`: the consumer is a Remotion composition,
    // which decodes a progressive file and cannot read an HLS playlist.
    expect(url.pathname).toBe(`/${PLAYBACK_ID}/high.mp4`);
    expect(tokenOf(source.url)).not.toBe("");
  });

  it("issues a URL that expires", async () => {
    /*
     * The assertion that has to bite: a URL minted with no expiry at all must
     * fail here, and so must one whose expiry is a decoration. So `exp` is read
     * out of the *signed* claims rather than off the result object — a token
     * without it is not merely unenforced, it is a different token — and it is
     * pinned to an exact arithmetic value, which fails just as loudly for a
     * hundred-year window as for a missing one.
     */
    const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
    const [, claims] = tokenOf(source.url).split(".");
    const payload = decodeSegment(claims ?? "");

    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBe(NOW / MS_PER_SECOND + TTL_SECONDS);

    // And the window is short in absolute terms, not merely present: a render
    // is submitted and picked up in minutes, and this URL is the only thing
    // standing between a leaked render payload and the source video.
    expect((payload.exp as number) - NOW / MS_PER_SECOND).toBeLessThanOrEqual(
      6 * 60 * 60
    );

    // The reported expiry is the signed one, so a caller that logs or stores it
    // is not told something different from what Mux will enforce.
    expect(source.expiresAt).toBe((payload.exp as number) * MS_PER_SECOND);

    // The clock is the caller's, so two mintings at different instants really
    // do expire at different times — without this, a hard-coded `exp` would
    // satisfy everything above.
    const later = await signedMuxSourceUrl(PLAYBACK_ID, NOW + 60_000);
    expect(later.expiresAt).toBe(source.expiresAt + 60_000);
  });

  it("signs the token with the configured signing key", async () => {
    /*
     * Verified with the public half of the pair, so this is a real RS256
     * check rather than a self-consistency one: a token this module builds and
     * does not sign, or signs with something else, fails here.
     */
    const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
    const [header, claims, signature] = tokenOf(source.url).split(".");
    const signed = new TextEncoder().encode(`${header}.${claims}`);

    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        base64UrlToBytes(signature ?? ""),
        signed
      )
    ).toBe(true);

    // The negative beside the positive: the same signature over claims that
    // were altered after signing is refused, which is the property the whole
    // token exists for.
    const tampered = new TextEncoder().encode(`${header}.${claims}x`);

    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        base64UrlToBytes(signature ?? ""),
        tampered
      )
    ).toBe(false);
  });

  it("binds the token to the playback id it was asked for", async () => {
    // Otherwise one issued URL is a key to every video Mux holds for this
    // account, for as long as it lasts.
    const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
    const other = await signedMuxSourceUrl("pbSomeOtherVideo0002", NOW);

    expect(decodeSegment(tokenOf(source.url).split(".")[1] ?? "").sub).toBe(
      PLAYBACK_ID
    );
    expect(decodeSegment(tokenOf(other.url).split(".")[1] ?? "").sub).toBe(
      "pbSomeOtherVideo0002"
    );
  });

  it("names the signing key and the audience Mux needs", async () => {
    // `kid` is how Mux finds the public half, and `aud: "v"` is what makes the
    // token a *playback* token rather than one for a thumbnail or a storyboard.
    // Getting either wrong is a 403 from Mux on every render.
    const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
    const [header, claims] = tokenOf(source.url).split(".");

    expect(decodeSegment(header ?? "")).toEqual({
      alg: "RS256",
      kid: STUB_KEY_ID,
      typ: "JWT",
    });
    expect(decodeSegment(claims ?? "").aud).toBe("v");
  });

  it("accepts a signing key given as PEM rather than base64", async () => {
    // Mux hands the key over base64-wrapped, and an operator pasting the PEM
    // itself into a secret is the likelier mistake of the two. Both work, so
    // neither is a deploy that fails on its first render.
    const base64 = process.env.MUX_SIGNING_KEY_PRIVATE ?? "";
    process.env.MUX_SIGNING_KEY_PRIVATE = atob(base64);

    try {
      const source = await signedMuxSourceUrl(PLAYBACK_ID, NOW);
      const [header, claims, signature] = tokenOf(source.url).split(".");

      expect(
        await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          publicKey,
          base64UrlToBytes(signature ?? ""),
          new TextEncoder().encode(`${header}.${claims}`)
        )
      ).toBe(true);
    } finally {
      process.env.MUX_SIGNING_KEY_PRIVATE = base64;
    }
  });

  it("refuses to mint a URL with no signing key configured", async () => {
    /*
     * A missing credential must fail on the one request that needed it, loudly
     * and by name. The alternative — an unsigned URL — is a source endpoint
     * handing out something Mux will refuse, which surfaces as a failed render
     * minutes later with nothing naming the cause.
     *
     * **The message is matched precisely, and that is the whole test.** An
     * earlier version asserted `/MUX_SIGNING_KEY/`, and the mutation that
     * deletes this guard outright *survived* it: with the guard gone an empty
     * key falls through to the PEM parser, whose own error also names
     * `MUX_SIGNING_KEY_PRIVATE`. Two different refusals, one regex, and a test
     * that could not tell them apart.
     */
    const key = process.env.MUX_SIGNING_KEY_PRIVATE;
    restoreEnv("MUX_SIGNING_KEY_PRIVATE", undefined);

    try {
      await expect(signedMuxSourceUrl(PLAYBACK_ID, NOW)).rejects.toThrow(
        /MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE must both be set/
      );
    } finally {
      process.env.MUX_SIGNING_KEY_PRIVATE = key ?? "";
    }

    // And a key nobody named is refused the same way. `kid` is how Mux finds
    // the public half, so a token minted without one is refused by Mux rather
    // than by this function — the same failure, discovered later and by
    // somebody else.
    process.env.MUX_SIGNING_KEY_ID = "";

    try {
      await expect(signedMuxSourceUrl(PLAYBACK_ID, NOW)).rejects.toThrow(
        /MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE must both be set/
      );
    } finally {
      process.env.MUX_SIGNING_KEY_ID = STUB_KEY_ID;
    }

    // The positive beside both: with the pair back, the same call answers.
    expect((await signedMuxSourceUrl(PLAYBACK_ID, NOW)).url).toContain(
      "token="
    );
  });

  it("does not put the signing key in the error it throws", async () => {
    /*
     * An error message is logged, and a log line is the one place a private key
     * must never reach. The variable is named; its value is not.
     *
     * The rejection is captured rather than caught around an
     * `expect.unreachable`. That spelling looks equivalent and is not: the
     * `unreachable` throw lands in the test's own `catch`, where the
     * assertions below pass against it happily — so a version of this function
     * that minted a URL instead of refusing would have been reported green.
     */
    const key = process.env.MUX_SIGNING_KEY_PRIVATE ?? "";
    process.env.MUX_SIGNING_KEY_ID = "";

    const outcome = await signedMuxSourceUrl(PLAYBACK_ID, NOW).then(
      (issued) => new Error(`minted ${issued.url} instead of refusing`),
      (thrown: unknown) => thrown
    );

    process.env.MUX_SIGNING_KEY_ID = STUB_KEY_ID;

    // The positive first, so the absences below are absences from the right
    // sentence rather than from whatever happened to be thrown.
    expect(String(outcome)).toContain("must both be set");
    expect(String(outcome)).not.toContain(key);
    expect(String(outcome)).not.toContain(atob(key).slice(0, 40));
  });
});

/*
 * ---------------------------------------------------------------------------
 * The back half of an asset's life
 * ---------------------------------------------------------------------------
 */

const STUB_TOKEN_ID = "mux-token-id-for-tests-only";
const STUB_TOKEN_SECRET = "mux-token-secret-for-tests-only";
const ORIGINAL_TOKEN_ID = process.env.MUX_TOKEN_ID;
const ORIGINAL_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

const ASSET_ID = "assetForTestsOnly001";

/**
 * Reading an asset and deleting one, against a fake that answers the shape of
 * Mux's protocol and nothing else.
 *
 * **Nothing here is evidence about Mux.** There are no Mux credentials in this
 * repository, so what these prove is that this application asks the right
 * question and reads the answer the way it says it does. Whether
 * `DELETE /video/v1/assets/:id` really answers `204`, and whether a missing
 * asset really answers `404`, is for a deployed environment to show. The Google
 * strategy's tests are the precedent and the warning.
 */
describe("Mux's back half", () => {
  /** Every request this file's code made, in order. */
  let calls: {
    method: string;
    url: string;
    authorization: string;
    body: string;
    signal: AbortSignal | null | undefined;
  }[] = [];
  /** What the fake answers next. Set per test. */
  let answer: () => Response = () => new Response(null, { status: 204 });

  const realFetch = globalThis.fetch;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  beforeAll(() => {
    process.env.MUX_TOKEN_ID = STUB_TOKEN_ID;
    process.env.MUX_TOKEN_SECRET = STUB_TOKEN_SECRET;

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith("https://api.mux.com/")) {
        return realFetch(input as RequestInfo, init);
      }

      const headers = new Headers(init?.headers);

      calls.push({
        authorization: headers.get("authorization") ?? "",
        body: typeof init?.body === "string" ? init.body : "",
        method: init?.method ?? "GET",
        signal: init?.signal,
        url,
      });

      return Promise.resolve(answer());
    });
  });

  beforeEach(() => {
    calls = [];
    answer = () => new Response(null, { status: 204 });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    restoreEnv("MUX_TOKEN_ID", ORIGINAL_TOKEN_ID);
    restoreEnv("MUX_TOKEN_SECRET", ORIGINAL_TOKEN_SECRET);
  });

  it("boots with the credentials this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that stubbed nothing would look green having proven nothing.
    expect(process.env.MUX_TOKEN_ID).toBe(STUB_TOKEN_ID);
    expect(process.env.MUX_TOKEN_SECRET).toBe(STUB_TOKEN_SECRET);
  });

  it("gives createMuxAssetFromUrl's request a signal that will abort a call which never answers", async () => {
    // Workers `fetch` has no default timeout, and a call that never answers
    // holds the request — or, from a job, the whole queue run — open until the
    // platform kills it. See `REQUEST_TIMEOUT_MS` in `mux.ts`.
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbCreateForTestsOnly", policy: "public" }],
          status: "preparing",
        },
      });

    await createMuxAssetFromUrl(
      "https://example.test/source.mp4",
      "render:test-only"
    );

    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });

  it("sends the identifier it was given as the asset's passthrough, so an asset a timed-out create made can be found", async () => {
    // A create that times out may still have made the asset on Mux's side.
    // `passthrough` is the one field Mux stores verbatim on the asset and
    // lets a person search by, so it is what ties an orphan back to the
    // render that asked for it.
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbCreateForTestsOnly", policy: "public" }],
          status: "preparing",
        },
      });

    await createMuxAssetFromUrl(
      "https://example.test/source.mp4",
      "render:passthrough-test"
    );

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.mux.com/video/v1/assets");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      input: [{ url: "https://example.test/source.mp4" }],
      passthrough: "render:passthrough-test",
      playback_policy: ["public"],
    });
  });

  it("gives readMuxAsset's request a signal that will abort a call which never answers", async () => {
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbReadForTestsOnly", policy: "public" }],
          status: "ready",
        },
      });

    await readMuxAsset(ASSET_ID);

    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });

  it("gives deleteMuxAsset's request a signal that will abort a call which never answers", async () => {
    await deleteMuxAsset(ASSET_ID);

    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });

  it("asks Mux to delete the asset it was given", async () => {
    await deleteMuxAsset(ASSET_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(
      `https://api.mux.com/video/v1/assets/${ASSET_ID}`
    );
    // The credentials travel in the header and nowhere else — not in the URL,
    // which is logged by every proxy between here and Mux.
    expect(calls[0]?.authorization).toBe(
      `Basic ${btoa(`${STUB_TOKEN_ID}:${STUB_TOKEN_SECRET}`)}`
    );
    expect(calls[0]?.url).not.toContain(STUB_TOKEN_SECRET);
  });

  it("does not read the body of a successful delete", async () => {
    // Mux answers `204 No Content`. Reading it as JSON would turn a completed
    // deletion into a throw, and the caller would leave the asset recorded and
    // ask again tomorrow, for ever.
    answer = () => new Response(null, { status: 204 });

    await expect(deleteMuxAsset(ASSET_ID)).resolves.toBeUndefined();
  });

  it("treats an asset Mux no longer has as deleted", async () => {
    /*
     * The whole of the job's resumability. An asset can be gone because an
     * operator removed it by hand, or because a previous run deleted it and
     * died before recording that it had. A 404 that read as a failure would
     * pin that sponsorship for ever.
     */
    answer = () =>
      json(
        { error: { messages: ["Asset not found"], type: "not_found" } },
        404
      );

    await expect(deleteMuxAsset(ASSET_ID)).resolves.toBeUndefined();
  });

  it("refuses to call a rejected delete a deletion", async () => {
    /*
     * The other half of the 404 rule, and the one that makes it safe. A 401 or
     * a 503 says nothing about whether the asset is there; swallowing it the
     * way a 404 is swallowed would clear the only record of an asset that is
     * still on Mux and still billed for.
     *
     * The rejection is captured with `.then(ok, err)` rather than caught
     * around an `expect.unreachable()`: that spelling puts the "should have
     * thrown" failure into the test's own `catch`, where the assertions pass
     * against it and a version that resolved would be reported green.
     */
    answer = () =>
      json({ error: { messages: ["Unauthorized"], type: "auth" } }, 401);

    const outcome = await deleteMuxAsset(ASSET_ID).then(
      () => new Error("resolved instead of refusing"),
      (thrown: unknown) => thrown
    );

    expect(String(outcome)).toContain("HTTP 401");
    expect(String(outcome)).toContain("Unauthorized");
    expect(String(outcome)).not.toContain(STUB_TOKEN_SECRET);
  });

  it("refuses to delete anything without credentials", async () => {
    restoreEnv("MUX_TOKEN_SECRET", undefined);

    const outcome = await deleteMuxAsset(ASSET_ID).then(
      () => new Error("resolved instead of refusing"),
      (thrown: unknown) => thrown
    );

    process.env.MUX_TOKEN_SECRET = STUB_TOKEN_SECRET;

    expect(String(outcome)).toContain("credentials are missing");
    // And nothing was asked of Mux at all, rather than asked without a header.
    expect(calls).toHaveLength(0);
    // The positive beside it: with the pair back, the same call goes through.
    await expect(deleteMuxAsset(ASSET_ID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("reports what Mux says about an asset", async () => {
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbReadForTestsOnly", policy: "public" }],
          status: "ready",
        },
      });

    await expect(readMuxAsset(ASSET_ID)).resolves.toEqual({
      playbackId: "pbReadForTestsOnly",
      status: "ready",
    });
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      `https://api.mux.com/video/v1/assets/${ASSET_ID}`
    );
  });

  it("reports an errored asset as errored rather than throwing", async () => {
    // `errored` is Mux's answer, not a failure to answer, and the caller acts
    // on it — a throw here would be indistinguishable from an outage, which the
    // caller must not act on. With its playback id intact, which is what Mux
    // really answers: the ids are minted when the asset is created, long before
    // ingest can fail. An errored asset is therefore one that has an id and
    // plays nothing, and a caller that only looked for a missing id would call
    // it healthy.
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbErroredForTestsOnly", policy: "public" }],
          status: "errored",
        },
      });

    await expect(readMuxAsset(ASSET_ID)).resolves.toEqual({
      playbackId: "pbErroredForTestsOnly",
      status: "errored",
    });
  });

  it("reports an asset Mux does not have as absent", async () => {
    answer = () =>
      json(
        { error: { messages: ["Asset not found"], type: "not_found" } },
        404
      );

    await expect(readMuxAsset(ASSET_ID)).resolves.toBeNull();
  });

  it("refuses to call an outage an absent asset", async () => {
    answer = () => json({ error: { messages: ["Service unavailable"] } }, 503);

    const outcome = await readMuxAsset(ASSET_ID).then(
      (state) => new Error(`answered ${JSON.stringify(state)}`),
      (thrown: unknown) => thrown
    );

    expect(String(outcome)).toContain("HTTP 503");
    expect(String(outcome)).toContain("Service unavailable");
  });

  it("does not take a signed playback id for a public one", async () => {
    // A `signed` id is not one an unauthenticated page can play, so an asset
    // carrying only signed ids has nothing this product can put on a page.
    answer = () =>
      json({
        data: {
          id: ASSET_ID,
          playback_ids: [{ id: "pbSignedForTestsOnly", policy: "signed" }],
          status: "ready",
        },
      });

    await expect(readMuxAsset(ASSET_ID)).resolves.toEqual({
      playbackId: null,
      status: "ready",
    });
  });

  it("refuses an answer that is not JSON at all", async () => {
    // A Cloudflare or Mux error page is HTML, sometimes with a 200 as a cached
    // edge response. Reading `{}` out of that is how a caller concludes an
    // asset has no playback id and throws away a composite that is alive.
    answer = () =>
      new Response("<html>502 Bad Gateway</html>", {
        headers: { "content-type": "text/html" },
        status: 200,
      });

    const outcome = await readMuxAsset(ASSET_ID).then(
      (state) => new Error(`answered ${JSON.stringify(state)}`),
      (thrown: unknown) => thrown
    );

    expect(String(outcome)).toContain("non-JSON body");
  });
});
