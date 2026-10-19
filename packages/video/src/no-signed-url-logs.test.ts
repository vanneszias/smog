import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { enableMasterAccess, masterState } from "./master";
import { createRenderUpload } from "./render-upload";
import { createFakeMux } from "./testing";
import { cancelUpload } from "./uploads";

/**
 * Review item 3: no signed URL (the master's, the upload's) reaches a log,
 * on the happy path or on a failure. The fake's signed URLs carry
 * `signature=`.
 */
describe("logs never carry a signed URL", () => {
  const lines: string[] = [];
  const spies: ReturnType<typeof spyOn>[] = [];

  beforeEach(() => {
    lines.length = 0;
    for (const method of ["log", "warn", "error"] as const) {
      spies.push(
        spyOn(console, method).mockImplementation((...args: unknown[]) => {
          lines.push(
            args
              .map((arg) =>
                arg instanceof Error
                  ? `${arg.message} ${arg.stack}`
                  : String(arg)
              )
              .join(" ")
          );
        })
      );
    }
  });

  afterEach(() => {
    for (const spy of spies.splice(0)) {
      spy.mockRestore();
    }
  });

  it("through master access, the render upload and its cancel", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    await enableMasterAccess(fake.mux, asset.id);
    fake.readyMaster(asset.id);
    const state = await masterState(fake.mux, asset.id);
    expect(state.status).toBe("ready");
    const upload = await createRenderUpload(fake.mux, {
      corsOrigin: "https://smog.test",
      environment: "production",
      renderJobId: "job-logs",
      test: false,
    });
    expect(upload.url).toContain("signature=");
    fake.completeUpload(upload.id);
    await cancelUpload(fake.mux, upload.id);
    for (const status of [500, 400]) {
      fake.failNext(status);
      // biome-ignore lint/performance/noAwaitInLoops: one failure at a time.
      await masterState(fake.mux, asset.id).catch(() => undefined);
    }
    fake.failNext(503);
    await createRenderUpload(fake.mux, {
      corsOrigin: "https://smog.test",
      environment: "production",
      renderJobId: "job-logs",
      test: false,
    }).catch(() => undefined);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain("signature=");
    }
  });
});
