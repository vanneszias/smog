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

import { readFileSync } from "node:fs";
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
  RemotionStartError,
  type StartRenderInput,
  startRemotionRender,
} from "@/lib/remotionLambda";

const FAKE_ACCESS_KEY_ID = "AKIAFAKEFORTESTSONLY1";
const FAKE_SECRET_ACCESS_KEY = "fake-secret-for-tests-only-never-real-000";

const REGION = "eu-central-1";
const FUNCTION_NAME = "remotion-render-4-0-484-mem2048mb-disk2048mb-120sec";
const FUNCTION_ARN =
  "arn:aws:lambda:eu-central-1:123456789012:function:remotion-render-x";
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
    // "warn", not "info": at "info" the start routine logs `inputProps`
    // (the signed `videoSrc` among them) to CloudWatch.
    logLevel: "warn",
    maxRetries: 1,
    privacy: "public",
    region: input.region as "eu-central-1",
    serveUrl: input.serveUrl,
    webhook: input.webhook,
  });
}

describe("the request, against @remotion/lambda-client 4.0.484", () => {
  it.each([
    ["a function name", FUNCTION_NAME],
    ["a function ARN", FUNCTION_ARN],
  ])("sends the official client's body byte for byte, to the same path, for %s", async (_name, functionName) => {
    const input = { ...startInput(), functionName };
    const official = await officialStart(input);
    expect(captured).toHaveLength(1);
    const wire = captured[0] as CapturedRequest;

    const ours = answerFetchWith(FIXTURES.success);
    await startRemotionRender(input);
    expect(ours).toHaveLength(1);
    const request = ours[0] as Request;
    const url = new URL(request.url);

    // Byte-identical, which is stronger than deep-equal: key order and all.
    const body = await request.text();
    expect(body).toBe(wire.body);
    expect(JSON.parse(body)).toStrictEqual(JSON.parse(wire.body));

    // Credentials travel only in the signature, in both clients.
    for (const credential of [FAKE_ACCESS_KEY_ID, FAKE_SECRET_ACCESS_KEY]) {
      expect(body).not.toContain(credential);
      expect(wire.body).not.toContain(credential);
    }

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
      logLevel: "warn",
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

  it.each([
    [""],
    ["eu-central-1.attacker.example"],
    ["attacker.example/"],
    ["EU-CENTRAL-1"],
    ["eu-central"],
    ["eu-central-1#"],
  ])("refuses the region %j before any fetch", async (region) => {
    await expect(
      startRemotionRender({ ...startInput(), region })
    ).rejects.toMatchObject({ message: "[remotionLambda] Invalid region" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a real region's shape", async () => {
    answerFetchWith(FIXTURES.success);

    await expect(
      startRemotionRender({ ...startInput(), region: "us-gov-west-1" })
    ).resolves.toMatchObject({ renderId: "8l1xk2p3qz" });
  });

  it("hands fetch a 30 s timeout signal that aborts the request", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const requests: Request[] = [];
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const request = input as Request;
      requests.push(request);

      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () =>
          reject(request.signal.reason)
        );
      });
    });

    const started = startRemotionRender(startInput());
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const request = requests[0] as Request;

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(request.signal.aborted).toBe(false);
    controller.abort(
      new DOMException("The operation timed out.", "TimeoutError")
    );
    expect(request.signal.aborted).toBe(true);
    await expect(started).rejects.toMatchObject({
      message: "[remotionLambda] Lambda did not answer within 30000 ms",
    });
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

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message,
    });
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

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message: "[remotionLambda] Lambda did not answer within 30000 ms",
    });
  });

  it("says when Lambda timed out while the body was being read", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(
              new DOMException("The operation timed out.", "TimeoutError")
            );
          },
        }),
        { status: 200 }
      )
    );

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message: "[remotionLambda] Lambda did not answer within 30000 ms",
    });
  });

  it("says when the body could not be read", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(new TypeError("terminated"));
          },
        }),
        { status: 200 }
      )
    );

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message: "[remotionLambda] Failed to read Lambda's response: TypeError",
    });
  });

  it.each([
    ["HTTP 403", FIXTURES.forbidden],
    ["a function error", FIXTURES.functionError],
  ])("cancels the unread body on %s", async (_name, fixture) => {
    const cancel = vi.fn();
    fetchSpy.mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel,
          start(controller) {
            controller.enqueue(new TextEncoder().encode(fixture.body));
          },
        }),
        { headers: fixture.headers, status: fixture.status }
      )
    );

    await expect(startRemotionRender(startInput())).rejects.toThrow(
      "[remotionLambda]"
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("says when Lambda could not be reached", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message: "[remotionLambda] Failed to reach Lambda: TypeError",
    });
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

/** A body whose read fails with `error` after the headers said 200. */
function unreadableBody(error: Error): Response {
  return new Response(
    new ReadableStream({
      pull(controller) {
        controller.error(error);
      },
    }),
    { status: 200 }
  );
}

/**
 * Whether a failure proves no render was started, which is what decides
 * whether `lib/renderJob.ts` hands the job's claim back or keeps it.
 *
 * **Definite** — the function was never run, or ran and refused: the claim
 * can go, because no webhook will ever name it. **Not definite** — the start
 * may have been accepted and the answer lost: the claim stays, so a late
 * webhook still finds its row and the stalled-render sweep fails it
 * otherwise. Every throw is classified; none is a bare `Error`.
 */
describe("the failure's class", () => {
  type Arrange = () => StartRenderInput;
  const answer =
    (fixture: Fixture): Arrange =>
    () => {
      answerFetchWith(fixture);

      return startInput();
    };
  const reject =
    (error: unknown): Arrange =>
    () => {
      fetchSpy.mockRejectedValue(error);

      return startInput();
    };
  const respond =
    (response: () => Response): Arrange =>
    () => {
      fetchSpy.mockImplementation(() => Promise.resolve(response()));

      return startInput();
    };
  const timeout = () =>
    new DOMException("The operation timed out.", "TimeoutError");

  it.each<[string, Arrange, boolean]>([
    // Definite: Lambda certainly did not start a render.
    ["an invalid region", () => ({ ...startInput(), region: "nope" }), true],
    [
      "missing credentials",
      () => {
        vi.stubEnv("REMOTION_AWS_ACCESS_KEY_ID", undefined);

        return startInput();
      },
      true,
    ],
    ["HTTP 403", answer(FIXTURES.forbidden), true],
    ["HTTP 400", answer({ body: "{}", status: 400 }), true],
    [
      "HTTP 429",
      answer({
        body: "{}",
        headers: { "x-amzn-errortype": "TooManyRequestsException" },
        status: 429,
      }),
      true,
    ],
    ["an x-amz-function-error", answer(FIXTURES.functionError), true],
    ['a { type: "error" } body', answer(FIXTURES.routineError), true],
    // Not definite: it may have started one.
    ["a timeout", reject(timeout()), false],
    ["a network TypeError", reject(new TypeError("fetch failed")), false],
    ["HTTP 500", answer({ body: "", status: 500 }), false],
    ["HTTP 503", answer({ body: "", status: 503 }), false],
    [
      "a body-read failure after a 2xx",
      respond(() => unreadableBody(new TypeError("terminated"))),
      false,
    ],
    [
      "a body-read timeout after a 2xx",
      respond(() => unreadableBody(timeout())),
      false,
    ],
    ["an empty body after a 2xx", answer({ body: "", status: 200 }), false],
    ["a non-JSON body after a 2xx", answer(FIXTURES.notJson), false],
    ["a success without ids", answer(FIXTURES.noIds), false],
  ])("classifies %s", async (_name, arrange, definite) => {
    const error = await startRemotionRender(arrange()).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(RemotionStartError);
    expect((error as RemotionStartError).name).toBe("RemotionStartError");
    expect((error as RemotionStartError).definite).toBe(definite);
    expect((error as RemotionStartError).message).toMatch(
      /^\[remotionLambda\] /
    );
  });
});

describe("credentials", () => {
  it.each([
    ["REMOTION_AWS_ACCESS_KEY_ID"],
    ["REMOTION_AWS_SECRET_ACCESS_KEY"],
  ])("throws before any fetch when %s is missing", async (name) => {
    vi.stubEnv(name, undefined);

    await expect(startRemotionRender(startInput())).rejects.toMatchObject({
      message: "[remotionLambda] AWS credentials are not set",
    });
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

describe("the Remotion version", () => {
  /** Read from the source, so the constant needs no export for this. */
  function remotionVersion(): string {
    const source = readFileSync(
      new URL("./remotionLambda.ts", import.meta.url),
      "utf8"
    );
    const match = /^const REMOTION_VERSION = "([^"]+)";$/m.exec(source);
    if (!match?.[1]) {
      throw new Error("REMOTION_VERSION not found in remotionLambda.ts");
    }

    return match[1];
  }

  function pin(packageJson: string, section: string, name: string): unknown {
    const manifest = JSON.parse(
      readFileSync(new URL(packageJson, import.meta.url), "utf8")
    ) as Record<string, Record<string, string> | undefined>;

    return manifest[section]?.[name];
  }

  it("is the one apps/render deploys the function with", () => {
    expect(
      pin("../../../render/package.json", "devDependencies", "@remotion/lambda")
    ).toBe(remotionVersion());
  });

  it("is the official client the contract tests run against", () => {
    expect(
      pin("../../package.json", "devDependencies", "@remotion/lambda-client")
    ).toBe(remotionVersion());
  });
});
