import { describe, expect, it } from "bun:test";
import { signMuxWebhook } from "./testing";
import {
  MUX_SIGNATURE_TOLERANCE_SECONDS,
  MuxSignatureError,
  verifyMuxWebhook,
} from "./webhooks";

const SECRET = "mux-webhook-test-secret";
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);

const EVENT = {
  created_at: "2026-10-02T12:00:00.000Z",
  data: { id: "asset-1", status: "ready" },
  id: "event-1",
  object: { id: "asset-1", type: "asset" },
  type: "video.asset.ready",
};

const BODY = JSON.stringify(EVENT);

async function signed(
  body: string,
  { secret = SECRET, timestamp = NOW_SECONDS } = {}
): Promise<Headers> {
  return new Headers({
    "mux-signature": await signMuxWebhook(body, secret, timestamp),
  });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("verifyMuxWebhook", () => {
  it("returns the parsed event for a valid signature", async () => {
    const event = await verifyMuxWebhook(BODY, await signed(BODY), SECRET, NOW);
    expect(event).toMatchObject({ id: "event-1", type: "video.asset.ready" });
  });

  it("accepts any matching v1 signature (secret rotation)", async () => {
    const good = await signMuxWebhook(BODY, SECRET, NOW_SECONDS);
    const other = await signMuxWebhook(BODY, "old-secret", NOW_SECONDS);
    const [, v1] = good.split("v1=");
    const headers = new Headers({
      "mux-signature": `${other},v1=${v1}`,
    });
    const event = await verifyMuxWebhook(BODY, headers, SECRET, NOW);
    expect(event.id).toBe("event-1");
  });

  it("rejects a tampered body", async () => {
    const headers = await signed(BODY);
    const tampered = BODY.replace("ready", "errored");
    const error = await rejection(
      verifyMuxWebhook(tampered, headers, SECRET, NOW)
    );
    expect(error).toBeInstanceOf(MuxSignatureError);
    expect((error as MuxSignatureError).reason).toBe("mismatch");
  });

  it("rejects the wrong secret", async () => {
    const headers = await signed(BODY, { secret: "another-secret" });
    const error = await rejection(verifyMuxWebhook(BODY, headers, SECRET, NOW));
    expect((error as MuxSignatureError).reason).toBe("mismatch");
  });

  it("rejects an old timestamp, and one too far ahead", async () => {
    const old = await signed(BODY, {
      timestamp: NOW_SECONDS - MUX_SIGNATURE_TOLERANCE_SECONDS - 1,
    });
    const ahead = await signed(BODY, {
      timestamp: NOW_SECONDS + MUX_SIGNATURE_TOLERANCE_SECONDS + 1,
    });
    for (const headers of [old, ahead]) {
      // biome-ignore lint/performance/noAwaitInLoops: two cases in order.
      const error = await rejection(
        verifyMuxWebhook(BODY, headers, SECRET, NOW)
      );
      expect((error as MuxSignatureError).reason).toBe("expired");
    }
  });

  it("accepts a timestamp at the edge of the tolerance", async () => {
    const headers = await signed(BODY, {
      timestamp: NOW_SECONDS - MUX_SIGNATURE_TOLERANCE_SECONDS,
    });
    const event = await verifyMuxWebhook(BODY, headers, SECRET, NOW);
    expect(event.id).toBe("event-1");
  });

  it("rejects a missing or malformed header", async () => {
    const cases = [
      new Headers(),
      new Headers({ "mux-signature": "" }),
      new Headers({ "mux-signature": "v1=abcd" }),
      new Headers({ "mux-signature": `t=${NOW_SECONDS}` }),
      new Headers({ "mux-signature": `t=soon,v1=${"a".repeat(64)}` }),
      new Headers({ "mux-signature": `t=${NOW_SECONDS},v1=not-hex` }),
    ];
    const reasons: string[] = [];
    for (const headers of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: the cases in order.
      const error = await rejection(
        verifyMuxWebhook(BODY, headers, SECRET, NOW)
      );
      expect(error).toBeInstanceOf(MuxSignatureError);
      reasons.push((error as MuxSignatureError).reason);
    }
    expect(reasons).toEqual([
      "missing",
      "missing",
      "malformed",
      "malformed",
      "malformed",
      "mismatch",
    ]);
  });

  it("rejects a signed body that is not a Mux event", async () => {
    const body = JSON.stringify({ hello: "world" });
    const error = await rejection(
      verifyMuxWebhook(body, await signed(body), SECRET, NOW)
    );
    expect((error as MuxSignatureError).reason).toBe("invalid-event");
  });

  it("refuses to verify without a secret", async () => {
    const error = await rejection(
      verifyMuxWebhook(BODY, await signed(BODY), "", NOW)
    );
    expect((error as MuxSignatureError).reason).toBe("no-secret");
  });
});
