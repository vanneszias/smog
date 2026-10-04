import { describe, expect, it } from "bun:test";
import { RENDER_ERROR_MESSAGE_MAX, renderResultSchema } from "../contract";
import { SourceFetchError, SourceUnreadableError } from "../metadata";
import {
  describeError,
  failureResponse,
  RenderServerError,
  RenderSupersededError,
  scrubUrls,
  toRenderServerError,
} from "./errors";

const SIGNED = "https://master.mux.com/a/master.mp4?token=SECRET&x=1";

describe("scrubUrls", () => {
  it("replaces every URL, signed or not", () => {
    expect(
      scrubUrls(
        `Error loading ${SIGNED}, see https://remotion.dev/docs (from http://127.0.0.1:8080/assets/x/logo) data:image/png;base64,AAAA`
      )
      // A comma may belong to a URL, so it is scrubbed with it.
    ).toBe("Error loading <url> see <url> (from <url>) <url>");
  });
});

describe("describeError", () => {
  it("is the name and the scrubbed message, never the cause", () => {
    const error = new Error(`could not fetch ${SIGNED}`, {
      cause: new Error(SIGNED),
    });
    expect(describeError(error)).toBe("Error: could not fetch <url>");
    expect(describeError("boom")).toBe("unknown failure (string)");
  });

  it("is truncated", () => {
    expect(describeError(new Error("x".repeat(5000)), 50)).toHaveLength(50);
  });
});

describe("toRenderServerError", () => {
  it("maps the metadata reader's errors (task 3 review, I-2)", () => {
    const cause = new Error(`Error fetching ${SIGNED}: 403 Forbidden`);
    const fetchError = toRenderServerError(
      new SourceFetchError(403, { cause })
    );
    expect(fetchError.code).toBe("renderFailed");
    expect(fetchError.message).toBe("the source could not be read (HTTP 403)");
    expect(fetchError.cause).toBeUndefined();

    const unreadable = toRenderServerError(
      new SourceUnreadableError("the source has no video track", { cause })
    );
    expect(unreadable.code).toBe("sourceUnreadable");
    expect(unreadable.cause).toBeUndefined();
  });

  it("keeps a coded error and maps anything else to renderFailed", () => {
    const coded = new RenderServerError("uploadFailed", "refused");
    expect(toRenderServerError(coded)).toBe(coded);
    expect(toRenderServerError(new RenderSupersededError())).toMatchObject({
      code: "renderFailed",
      message: "superseded by a newer request for the same job",
    });
    const other = toRenderServerError(new Error(`OffthreadVideo ${SIGNED}`));
    expect(other.code).toBe("renderFailed");
    expect(other.message).toBe("Error: OffthreadVideo <url>");
  });
});

describe("failureResponse", () => {
  it("answers the contract's status and a valid, bounded result", async () => {
    const response = failureResponse(
      new RenderServerError("busy", "y".repeat(RENDER_ERROR_MESSAGE_MAX + 10))
    );
    expect(response.status).toBe(503);
    const body = renderResultSchema.parse(await response.json());
    expect(body.ok).toBe(false);
    for (const [code, status] of [
      ["invalidInput", 422],
      ["sourceUnreadable", 422],
      ["logoUnreadable", 422],
      ["renderFailed", 500],
      ["uploadFailed", 502],
    ] as const) {
      expect(failureResponse(new RenderServerError(code, "m")).status).toBe(
        status
      );
    }
  });
});
