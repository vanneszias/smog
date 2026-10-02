import { describe, expect, it } from "vitest";
import {
  createMuxUploadController,
  type MuxUploadDeps,
  type MuxUploadState,
  type MuxXhr,
} from "../src/client/use-mux-upload";
import type { MuxUploadProgress } from "../src/schema";

/*
 * The upload state machine with a fake XHR and a scripted status:
 * creating → uploading (progress) → processing (2 s polls) → ready, and
 * each way it fails (create, transfer, processing, cancelled, slow and
 * its retry).
 */

class FakeXhr implements MuxXhr {
  static last: FakeXhr | null = null;
  aborted = false;
  body: unknown;
  headers: Record<string, string> = {};
  method = "";
  onabort: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onload: ((event: unknown) => void) | null = null;
  status = 0;
  upload: MuxXhr["upload"] = { onprogress: null };
  url = "";

  constructor() {
    FakeXhr.last = this;
  }

  abort(): void {
    this.aborted = true;
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  send(body: unknown): void {
    this.body = body;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  finish(status: number): void {
    this.status = status;
    this.onload?.({});
  }
}

const FILE = { name: "zwaaien.mp4", size: 1000, type: "video/mp4" };
const UPLOAD = {
  uploadId: "up-1",
  url: "https://direct.production.mux.com/upload/up-1",
};

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean): Promise<void> {
  // workerd's `Date.now()` advances across I/O, which timers are.
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polling a condition.
    await tick(1);
  }
  expect(check()).toBe(true);
}

function setup(
  statuses: (MuxUploadProgress | Error)[],
  overrides: Partial<MuxUploadDeps> = {}
) {
  let clock = 0;
  const seen: MuxUploadState["status"][] = [];
  const polls: string[] = [];
  const controller = createMuxUploadController({
    createUpload: () => Promise.resolve(UPLOAD),
    createXhr: () => new FakeXhr(),
    now: () => clock,
    pollIntervalMs: 0,
    uploadStatus: (uploadId) => {
      polls.push(uploadId);
      clock += 2000;
      const next = statuses.length > 1 ? statuses.shift() : statuses[0];
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next as MuxUploadProgress);
    },
    ...overrides,
  });
  controller.subscribe(() => {
    const { status } = controller.state();
    if (seen.at(-1) !== status) {
      seen.push(status);
    }
  });
  return { controller, polls, seen };
}

const READY: MuxUploadProgress = {
  asset: { id: "as-1", playbackId: "pb-1", status: "ready" },
  upload: "asset_created",
};

describe("the Mux upload controller", () => {
  it("creates, PUTs with progress, polls and ends ready", async () => {
    const { controller, polls, seen } = setup([
      { upload: "waiting" },
      { asset: { id: "as-1", status: "preparing" }, upload: "asset_created" },
      READY,
    ]);
    controller.start(FILE);
    await until(() => controller.state().status === "uploading");
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(UPLOAD.url);
    expect(xhr.headers).toEqual({ "Content-Type": "video/mp4" });
    expect(xhr.body).toBe(FILE);
    xhr.progress(250, 1000);
    expect(controller.state()).toMatchObject({
      progress: 0.25,
      status: "uploading",
    });
    xhr.finish(200);
    await until(() => controller.state().status === "ready");
    expect(controller.state()).toEqual({
      assetId: "as-1",
      file: FILE,
      playbackId: "pb-1",
      status: "ready",
      uploadId: "up-1",
    });
    expect(polls).toEqual(["up-1", "up-1", "up-1"]);
    expect(seen).toEqual(["creating", "uploading", "processing", "ready"]);
  });

  it("fails `create` when no upload URL comes back", async () => {
    const { controller } = setup([READY], {
      createUpload: () => Promise.reject(new Error("INVALID_STATE")),
    });
    controller.start(FILE);
    await until(() => controller.state().status === "failed");
    expect(controller.state()).toMatchObject({ reason: "create" });
  });

  it("fails `transfer` on a refused or broken PUT, and retry starts again", async () => {
    const { controller } = setup([READY]);
    controller.start(FILE);
    await until(() => controller.state().status === "uploading");
    (FakeXhr.last as FakeXhr).finish(403);
    expect(controller.state()).toMatchObject({
      detail: "HTTP 403",
      reason: "transfer",
      status: "failed",
    });
    controller.retry();
    await until(() => controller.state().status === "uploading");
    (FakeXhr.last as FakeXhr).onerror?.({});
    expect(controller.state()).toMatchObject({ reason: "transfer" });
  });

  it("fails `processing` with Mux's message, and `cancelled` for a cancelled upload", async () => {
    const errored = setup([
      {
        asset: { id: "as-1", status: "errored" },
        error: "Bad file",
        upload: "asset_created",
      },
    ]);
    errored.controller.start(FILE);
    await until(() => errored.controller.state().status === "uploading");
    (FakeXhr.last as FakeXhr).finish(200);
    await until(() => errored.controller.state().status === "failed");
    expect(errored.controller.state()).toMatchObject({
      detail: "Bad file",
      reason: "processing",
    });

    const cancelled = setup([{ upload: "timed_out" }]);
    cancelled.controller.start(FILE);
    await until(() => cancelled.controller.state().status === "uploading");
    (FakeXhr.last as FakeXhr).finish(200);
    await until(() => cancelled.controller.state().status === "failed");
    expect(cancelled.controller.state()).toMatchObject({ reason: "cancelled" });
  });

  it("gives up after 10 minutes as `slow`, keeps polling through errors, and retry resumes", async () => {
    const { controller, polls } = setup([
      new Error("network"),
      { upload: "waiting" },
    ]);
    controller.start(FILE);
    await until(() => controller.state().status === "uploading");
    (FakeXhr.last as FakeXhr).finish(200);
    await until(() => controller.state().status === "failed");
    expect(controller.state()).toMatchObject({
      reason: "slow",
      uploadId: "up-1",
    });
    // Every poll advances the fake clock by 2 s: 300 polls fill 10 minutes.
    expect(polls).toHaveLength(300);
    controller.retry();
    expect(controller.state().status).toBe("processing");
    await until(() => polls.length > 300);
    controller.reset();
    expect(controller.state()).toEqual({ status: "idle" });
  });

  it("reset aborts the PUT and ignores its late answer", async () => {
    const { controller } = setup([READY]);
    controller.start(FILE);
    await until(() => controller.state().status === "uploading");
    const xhr = FakeXhr.last as FakeXhr;
    controller.reset();
    expect(xhr.aborted).toBe(true);
    xhr.finish(200);
    await tick(5);
    expect(controller.state()).toEqual({ status: "idle" });
  });
});
