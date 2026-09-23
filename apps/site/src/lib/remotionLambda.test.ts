/**
 * Remotion Lambda's start routine, invoked by `lib/remotionLambda.ts` with a
 * signed `fetch` and checked against the official client.
 *
 * Node, not jsdom: the contract tests run `@remotion/lambda-client` itself, and
 * its bundled AWS SDK sends through `node:http`.
 *
 * **No AWS call is made.** The official client is pointed at a server on
 * 127.0.0.1 through the SDK's own endpoint override
 * (`AWS_ENDPOINT_URL_LAMBDA`), and ours is answered by a `fetch` stub. Every
 * credential below is a fake.
 *
 * @vitest-environment node
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { renderMediaOnLambda } from "@remotion/lambda-client";
import type { SponsoredVideoInputProps } from "@smog/types/render";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  type StartRenderInput,
  startRemotionRender,
} from "@/lib/remotionLambda";

const FAKE_ACCESS_KEY_ID = "AKIAFAKEFORTESTSONLY1";
const FAKE_SECRET_ACCESS_KEY = "fake-secret-for-tests-only-never-real-000";

const REGION = "eu-central-1";
const FUNCTION_NAME = "remotion-render-4-0-484-mem2048mb-disk2048mb-120sec";
const SERVE_URL =
  "https://remotionlambda-eucentral1-abcdef1234.s3.eu-central-1.amazonaws.com/sites/smog-render/index.html";

const INPUT_PROPS: SponsoredVideoInputProps = {
  logoUrl: "https://smog.example/media/logo.png",
  sponsorName: "Bakkerij Test",
  videoSrc: "https://stream.mux.example/source.mp4?token=not-a-real-token",
};

const WEBHOOK: StartRenderInput["webhook"] = {
  customData: { jobId: "job-42" },
  secret: "render-callback-secret-for-tests",
  url: "https://smog.example/render/callback",
};

function startInput(): StartRenderInput {
  return {
    composition: "SponsoredVideo",
    functionName: FUNCTION_NAME,
    inputProps: INPUT_PROPS,
    region: REGION,
    serveUrl: SERVE_URL,
    webhook: WEBHOOK,
  };
}

/**
 * What the start routine writes back, as `@remotion/serverless` 4.0.484
 * writes it: `dist/inner-routine.js` sends `JSON.stringify(response)` where
 * `response` is `startHandler`'s `{ type: "success", bucketName, renderId }`
 * (`dist/handlers/start.js`), or `{ type: "error", message: err.stack }` when
 * it throws. Remotion exports no encoder for this: it is plain JSON.
 */
const SUCCESS_BODY = JSON.stringify({
  type: "success",
  bucketName: "remotionlambda-eucentral1-abcdef1234",
  renderId: "8l1xk2p3qz",
});

const ERROR_BODY = JSON.stringify({
  type: "error",
  message:
    "Error: Incompatible site: When visiting the site, the Remotion version was 4.0.400\n    at checkVersionMismatch (/var/task/index.js:1:1)",
});

interface Fixture {
  body: string;
  headers?: Record<string, string>;
  status: number;
}

/** A Lambda `Invoke` response, as AWS sends it. */
const FIXTURES = {
  success: { body: SUCCESS_BODY, status: 200 },
  routineError: { body: ERROR_BODY, status: 200 },
  functionError: {
    body: JSON.stringify({
      errorMessage: "Task timed out",
      errorType: "Sandbox.Timedout",
    }),
    headers: { "x-amz-function-error": "Unhandled" },
    status: 200,
  },
  notJson: { body: SUCCESS_BODY.slice(0, 30), status: 200 },
  noIds: { body: JSON.stringify({ type: "success" }), status: 200 },
  forbidden: {
    body: JSON.stringify({
      Type: "User",
      message: "The security token included in the request is invalid.",
    }),
    headers: {
      "x-amzn-errortype":
        "UnrecognizedClientException:http://internal.amazon.com/coral/com.amazon.coral.service/",
    },
    status: 403,
  },
} satisfies Record<string, Fixture>;

interface CapturedRequest {
  body: string;
  headers: IncomingMessage["headers"];
  method: string;
  path: string;
}

/** Stands in for `lambda.eu-central-1.amazonaws.com` for the official client. */
let server: Server;
let serverOrigin = "";
const captured: CapturedRequest[] = [];
let serverFixture: Fixture = FIXTURES.success;

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      captured.push({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: request.headers,
        method: request.method ?? "",
        path: request.url ?? "",
      });
      response.writeHead(serverFixture.status, {
        "content-type": "application/json",
        "x-amzn-requestid": "00000000-0000-0000-0000-000000000000",
        ...serverFixture.headers,
      });
      response.end(serverFixture.body);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  serverOrigin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  captured.length = 0;
  serverFixture = FIXTURES.success;
  vi.stubEnv("REMOTION_AWS_ACCESS_KEY_ID", FAKE_ACCESS_KEY_ID);
  vi.stubEnv("REMOTION_AWS_SECRET_ACCESS_KEY", FAKE_SECRET_ACCESS_KEY);
  vi.stubEnv("REMOTION_AWS_SESSION_TOKEN", undefined);
  vi.stubEnv("REMOTION_AWS_PROFILE", undefined);
  vi.stubEnv("REMOTION_SKIP_AWS_CREDENTIALS_CHECK", undefined);
  // Every AWS service the official client could reach goes to 127.0.0.1, and
  // each call builds a fresh SDK client so the endpoint is never stale.
  vi.stubEnv("AWS_ENDPOINT_URL", serverOrigin);
  vi.stubEnv("AWS_ENDPOINT_URL_LAMBDA", serverOrigin);
  vi.stubEnv("REMOTION_DISABLE_AWS_CLIENT_CACHE", "1");
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Answers our `fetch` with a fixture, and keeps the request it was given. */
function answerFetchWith(fixture: Fixture): Request[] {
  const requests: Request[] = [];
  fetchSpy.mockImplementation((input: RequestInfo | URL) => {
    requests.push(input as Request);

    return Promise.resolve(
      new Response(fixture.body, {
        headers: { "content-type": "application/json", ...fixture.headers },
        status: fixture.status,
      })
    );
  });

  return requests;
}

/** The official client's `renderMediaOnLambda`, with the options ours fixes. */
function officialStart(input: StartRenderInput) {
  return renderMediaOnLambda({
    codec: "h264",
    composition: input.composition,
    functionName: input.functionName,
    inputProps: input.inputProps as unknown as Record<string, unknown>,
    logLevel: "info",
    maxRetries: 1,
    privacy: "public",
    region: input.region as "eu-central-1",
    serveUrl: input.serveUrl,
    webhook: input.webhook,
  });
}

describe("the request, against @remotion/lambda-client 4.0.484", () => {
  it("sends the official client's body byte for byte, to the same path", async () => {
    const official = await officialStart(startInput());
    expect(captured).toHaveLength(1);
    const wire = captured[0] as CapturedRequest;

    const ours = answerFetchWith(FIXTURES.success);
    await startRemotionRender(startInput());
    expect(ours).toHaveLength(1);
    const request = ours[0] as Request;
    const url = new URL(request.url);

    // Byte-identical, which is stronger than deep-equal: key order and all.
    const body = await request.text();
    expect(body).toBe(wire.body);
    expect(JSON.parse(body)).toStrictEqual(JSON.parse(wire.body));

    expect(request.method).toBe(wire.method);
    expect(`${url.pathname}${url.search}`).toBe(wire.path);
    expect(request.headers.get("x-amz-invocation-type")).toBe(
      wire.headers["x-amz-invocation-type"]
    );
    expect(request.headers.get("content-type")).toBe(
      wire.headers["content-type"]
    );

    // And both read the answer the same way.
    expect(official.renderId).toBe("8l1xk2p3qz");
    expect(official.bucketName).toBe("remotionlambda-eucentral1-abcdef1234");
  });

  it("puts the fixed options where the official client would", async () => {
    await officialStart(startInput());
    const payload = JSON.parse((captured[0] as CapturedRequest).body);

    expect(payload).toMatchObject({
      type: "start",
      version: "4.0.484",
      codec: "h264",
      privacy: "public",
      logLevel: "info",
      maxRetries: 1,
      webhook: WEBHOOK,
      inputProps: { type: "payload", payload: JSON.stringify(INPUT_PROPS) },
    });
  });

  it.each([
    ["success", FIXTURES.success],
    ["a routine error", FIXTURES.routineError],
    ["a function error", FIXTURES.functionError],
    ["a body that is not JSON", FIXTURES.notJson],
    ["HTTP 403", FIXTURES.forbidden],
  ])("agrees with the official client on %s", async (_name, fixture) => {
    serverFixture = fixture;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const official = await officialStart(startInput()).then(
      (result) => ({
        ok: true as const,
        value: { bucketName: result.bucketName, renderId: result.renderId },
      }),
      () => ({ ok: false as const })
    );

    answerFetchWith(fixture);
    const ours = await startRemotionRender(startInput()).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const })
    );

    // The official client was answered by 127.0.0.1, never by AWS.
    expect(captured).toHaveLength(1);
    expect(ours).toStrictEqual(official);
  });
});

describe("the signed request", () => {
  it("is a SigV4-signed POST to Lambda's Invoke API in the given region", async () => {
    const requests = answerFetchWith(FIXTURES.success);
    await startRemotionRender(startInput());
    const request = requests[0] as Request;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      `https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/${FUNCTION_NAME}/invocations`
    );
    expect(request.headers.get("x-amz-invocation-type")).toBe(
      "RequestResponse"
    );
    expect(request.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(request.headers.get("authorization")).toMatch(
      new RegExp(
        `^AWS4-HMAC-SHA256 Credential=${FAKE_ACCESS_KEY_ID}/\\d{8}/eu-central-1/lambda/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$`
      )
    );
    expect(JSON.parse(await request.text())).toMatchObject({
      type: "start",
      composition: "SponsoredVideo",
      serveUrl: SERVE_URL,
    });
  });

  it("encodes the function name into the path", async () => {
    const requests = answerFetchWith(FIXTURES.success);
    await startRemotionRender({
      ...startInput(),
      functionName: "arn:aws:lambda:eu-central-1:123456789012:function:render",
    });

    expect(new URL((requests[0] as Request).url).pathname).toBe(
      "/2015-03-31/functions/arn%3Aaws%3Alambda%3Aeu-central-1%3A123456789012%3Afunction%3Arender/invocations"
    );
  });

  it("does not retry, as the official client sets maxAttempts: 1", async () => {
    answerFetchWith({ body: "", status: 503 });

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      "[remotionLambda]"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("the answer", () => {
  it("resolves the renderId and bucketName the start routine returns", async () => {
    answerFetchWith(FIXTURES.success);

    await expect(startRemotionRender(startInput())).resolves.toStrictEqual({
      bucketName: "remotionlambda-eucentral1-abcdef1234",
      renderId: "8l1xk2p3qz",
    });
  });

  it.each([
    [
      "a routine error, with Remotion's message",
      FIXTURES.routineError,
      "[remotionLambda] The start routine failed: Error: Incompatible site: When visiting the site, the Remotion version was 4.0.400",
    ],
    [
      "a function error",
      FIXTURES.functionError,
      "[remotionLambda] The Lambda function failed (Unhandled)",
    ],
    [
      "a truncated body",
      FIXTURES.notJson,
      "[remotionLambda] The start routine's response is not JSON",
    ],
    [
      "a success without ids",
      FIXTURES.noIds,
      "[remotionLambda] The start routine's response has no renderId and bucketName",
    ],
    [
      "an empty body",
      { body: "", status: 200 },
      "[remotionLambda] Lambda returned no payload (HTTP 200)",
    ],
    [
      "HTTP 403",
      FIXTURES.forbidden,
      "[remotionLambda] Lambda refused the invoke with HTTP 403 (UnrecognizedClientException)",
    ],
  ])("throws on %s", async (_name, fixture, message) => {
    answerFetchWith(fixture);

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      new Error(message)
    );
  });

  it("throws a distinct message for each failure", async () => {
    const messages = new Set<string>();
    for (const fixture of [
      FIXTURES.routineError,
      FIXTURES.functionError,
      FIXTURES.notJson,
      FIXTURES.noIds,
      FIXTURES.forbidden,
      { body: "", status: 200 },
    ]) {
      answerFetchWith(fixture);
      const error = await startRemotionRender(startInput()).catch(
        (caught: unknown) => caught as Error
      );
      messages.add((error as Error).message);
    }

    expect(messages.size).toBe(6);
  });

  it("says when Lambda did not answer in time", async () => {
    fetchSpy.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError")
    );

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      new Error("[remotionLambda] Lambda did not answer within 30000 ms")
    );
  });

  it("says when Lambda could not be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      new Error("[remotionLambda] Failed to reach Lambda: TypeError")
    );
  });

  it("never puts a body, a credential, a prop or a URL in an error", async () => {
    for (const fixture of Object.values(FIXTURES)) {
      if (fixture === FIXTURES.success) {
        continue;
      }
      answerFetchWith(fixture);
      const error = (await startRemotionRender(startInput()).catch(
        (caught: unknown) => caught
      )) as Error;

      for (const secret of [
        FAKE_ACCESS_KEY_ID,
        FAKE_SECRET_ACCESS_KEY,
        WEBHOOK.secret,
        INPUT_PROPS.videoSrc,
        INPUT_PROPS.sponsorName,
        SERVE_URL,
        "security token",
        "Task timed out",
        "/var/task",
      ]) {
        expect(error.message).not.toContain(secret);
      }
    }
  });
});

describe("credentials", () => {
  it.each([
    ["REMOTION_AWS_ACCESS_KEY_ID"],
    ["REMOTION_AWS_SECRET_ACCESS_KEY"],
  ])("throws before any fetch when %s is missing", async (name) => {
    vi.stubEnv(name, undefined);

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      new Error("[remotionLambda] AWS credentials are not set")
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads them per call, not at import", async () => {
    vi.stubEnv("REMOTION_AWS_ACCESS_KEY_ID", "AKIASECONDFAKEKEY001");
    const requests = answerFetchWith(FIXTURES.success);
    await startRemotionRender(startInput());

    expect((requests[0] as Request).headers.get("authorization")).toContain(
      "Credential=AKIASECONDFAKEKEY001/"
    );
  });
});
