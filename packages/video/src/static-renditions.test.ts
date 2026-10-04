import { describe, expect, it } from "bun:test";
import { getAsset, type StaticRenditionFile } from "./assets";
import { MuxApiError } from "./client";
import {
  enableStaticRendition,
  STATIC_RENDITION_STATES,
  staticRenditionState,
} from "./static-renditions";
import { createFakeMux } from "./testing";

function file(
  name: string,
  status: string | null,
  resolution: string | null = null
): StaticRenditionFile {
  return { id: `id-${name}`, name, resolution, status };
}

describe("enableStaticRendition (phase 8 ruling 5)", () => {
  it("POSTs { resolution: highest } and reads Mux's 201 (preparing)", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    const created = await enableStaticRendition(fake.mux, asset.id, "highest");
    expect(created).toMatchObject({
      name: "highest.mp4",
      resolution: "highest",
      status: "preparing",
    });
    expect(fake.requests.at(-1)).toEqual({
      body: { resolution: "highest" },
      method: "POST",
      path: `/video/v1/assets/${asset.id}/static-renditions`,
    });
    // The fake keeps it on the asset, as Mux does.
    const read = await getAsset(fake.mux, asset.id);
    expect(read && staticRenditionState(read)).toBe("preparing");
    fake.readyStaticRendition(asset.id);
    const ready = await getAsset(fake.mux, asset.id);
    expect(ready && staticRenditionState(ready)).toBe("ready");
  });

  it("is null for an asset Mux does not know", async () => {
    const fake = createFakeMux();
    expect(
      await enableStaticRendition(fake.mux, "missing", "highest")
    ).toBeNull();
  });

  it("throws on a refusal, with Mux's Retry-After on a 429", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    fake.failNext(429, { "retry-after": "7" });
    const error = await enableStaticRendition(
      fake.mux,
      asset.id,
      "highest"
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MuxApiError);
    expect(error).toMatchObject({ retryAfterSeconds: 7, status: 429 });
  });

  it("the fake refuses a second highest rendition, as Mux does", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    await enableStaticRendition(fake.mux, asset.id, "highest");
    await expect(
      enableStaticRendition(fake.mux, asset.id, "highest")
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("staticRenditionState (phase 8 ruling 5)", () => {
  const state = (
    files: StaticRenditionFile[] | null,
    mp4Support: string | null = null,
    status: string | null = null
  ) =>
    staticRenditionState({
      mp4Support,
      staticRenditions: files === null ? null : { files, status },
    });

  it("lists its states", () => {
    expect(STATIC_RENDITION_STATES).toEqual([
      "ready",
      "preparing",
      "absent",
      "errored",
      "legacy-mp4",
    ]);
  });

  it("reads the highest rendition's own status", () => {
    expect(state([file("highest.mp4", "ready", "highest")])).toBe("ready");
    expect(state([file("highest.mp4", "preparing", "highest")])).toBe(
      "preparing"
    );
    // Found by its name too.
    expect(state([file("highest.mp4", "ready")])).toBe("ready");
  });

  it("reports a per-file errored or skipped highest rendition as errored", () => {
    expect(state([file("highest.mp4", "errored", "highest")])).toBe("errored");
    expect(state([file("highest.mp4", "skipped", "highest")])).toBe("errored");
  });

  it("treats a status Mux may add later as preparing (never billed twice)", () => {
    expect(state([file("highest.mp4", "queued", "highest")])).toBe("preparing");
  });

  it("is absent without static renditions, or with only other resolutions", () => {
    expect(state(null)).toBe("absent");
    expect(state([])).toBe("absent");
    expect(state([file("1080p.mp4", "ready", "1080p")])).toBe("absent");
  });

  it("is legacy-mp4 only when mp4_support produced a high.mp4", () => {
    expect(
      state(
        [file("low.mp4", null), file("high.mp4", null)],
        "standard",
        "ready"
      )
    ).toBe("legacy-mp4");
    expect(state([file("high.mp4", "ready")], "standard")).toBe("legacy-mp4");
    // mp4_support without high.mp4 (capped-1080p, or files not made yet):
    // absent, so a new rendition is made (open risk 6).
    expect(
      state([file("capped-1080p.mp4", null)], "capped-1080p", "ready")
    ).toBe("absent");
    expect(state([], "standard", "preparing")).toBe("absent");
    expect(state(null, "standard")).toBe("absent");
  });

  it("is preparing while the legacy high.mp4 is, and absent once it errored", () => {
    expect(state([file("high.mp4", null)], "standard", "preparing")).toBe(
      "preparing"
    );
    expect(state([file("high.mp4", "errored")], "standard")).toBe("absent");
    expect(state([file("high.mp4", null)], "standard", "errored")).toBe(
      "absent"
    );
  });

  it("prefers the highest rendition over a legacy high.mp4", () => {
    expect(
      state(
        [
          file("high.mp4", "ready"),
          file("highest.mp4", "preparing", "highest"),
        ],
        "standard"
      )
    ).toBe("preparing");
  });

  it("reads Mux's asset JSON through getAsset", async () => {
    const fake = createFakeMux();
    const legacy = fake.addAsset({
      mp4Support: "standard",
      staticRenditions: [
        { id: "f1", name: "high.mp4", resolution: null, status: null },
      ],
      staticRenditionsStatus: "ready",
    });
    const plain = fake.addAsset();
    const errored = fake.addAsset({
      staticRenditions: [
        {
          id: "f2",
          name: "highest.mp4",
          resolution: "highest",
          status: "errored",
        },
      ],
    });
    const read = async (id: string) => {
      const asset = await getAsset(fake.mux, id);
      if (!asset) {
        throw new Error("expected the asset");
      }
      return staticRenditionState(asset);
    };
    expect(await read(legacy.id)).toBe("legacy-mp4");
    expect(await read(plain.id)).toBe("absent");
    expect(await read(errored.id)).toBe("errored");
  });
});
