import { describe, expect, it } from "bun:test";
import {
  cookieHeader,
  devMailOf,
  renderAssetOf,
  runCleanups,
} from "./render-local-loop";

describe("cookieHeader", () => {
  it("keeps each cookie's name and value, without attributes", () => {
    expect(
      cookieHeader([
        "better-auth.session_token=abc.def; Path=/; HttpOnly; SameSite=Lax",
        "smog_mx=1; Max-Age=60",
      ])
    ).toBe("better-auth.session_token=abc.def; smog_mx=1");
  });

  it("is empty without cookies", () => {
    expect(cookieHeader([])).toBe("");
  });
});

describe("devMailOf", () => {
  it("keeps a stored mailbox (a JSON list)", () => {
    expect(devMailOf('[{"to":"a@b.c"}]\n')).toEqual({
      kind: "mailbox",
      value: '[{"to":"a@b.c"}]',
    });
  });

  it("reads wrangler's Value not found, on stdout or stderr, as no mailbox", () => {
    expect(devMailOf("Value not found\n")).toEqual({ kind: "absent" });
    expect(devMailOf("", "Value not found\n")).toEqual({ kind: "absent" });
  });

  it("reads anything else as unreadable, so the restore never deletes it (task 9 review M-5)", () => {
    expect(devMailOf('▲ [WARNING] proxy\n[{"to":"a@b.c"}]')).toEqual({
      kind: "unreadable",
    });
    expect(devMailOf('[{"to":"a@b.c"')).toEqual({ kind: "unreadable" });
    expect(devMailOf("")).toEqual({ kind: "unreadable" });
  });
});

describe("runCleanups", () => {
  it("runs each cleanup once, last first, past one that fails", async () => {
    const ran: string[] = [];
    const { error } = console;
    console.error = () => undefined;
    const list = [
      () => {
        ran.push("mailbox");
        return Promise.resolve();
      },
      () => {
        ran.push("children");
        return Promise.reject(new Error("already gone"));
      },
      () => {
        ran.push("fixture");
        return Promise.resolve();
      },
    ];
    try {
      await runCleanups(list);
      await runCleanups(list);
    } finally {
      console.error = error;
    }
    expect(ran).toEqual(["fixture", "children", "mailbox"]);
  });
});

describe("renderAssetOf", () => {
  const asset = (passthrough: string | null, status = "ready") => ({
    file: new Uint8Array([1]),
    id: `asset-${passthrough}`,
    passthrough,
    playbackId: "p",
    status,
  });

  it("finds the job's ready render asset", () => {
    const found = renderAssetOf(
      [
        asset(null),
        asset("render-job:dev:other"),
        asset("render-job:dev:job-1"),
      ],
      "job-1"
    );
    expect(found?.id).toBe("asset-render-job:dev:job-1");
  });

  it("ignores a gesture upload and an asset that is not ready", () => {
    expect(
      renderAssetOf(
        [
          asset("gesture-upload:job-1"),
          asset("render-job:dev:job-1", "errored"),
          // Another env's, or the untagged phase 7 form (ruling 4).
          asset("render-job:staging:job-1"),
          asset("render-job:job-1"),
        ],
        "job-1"
      )
    ).toBeNull();
  });
});
