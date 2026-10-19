import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE_MUX_TOKEN, type FakeAsset } from "@smog/video/testing";
import {
  type FakeMuxServer,
  startFakeMuxServer,
} from "@smog/video/testing/server";
import { main } from "../src/cli/main";
import {
  exportPlaybackIds,
  type MuxContext,
  RENDITIONS_LEDGER,
  renditionTargets,
  runMuxRenditions,
  runMuxScan,
} from "../src/cli/mux";
import type { Timer } from "../src/cli/remote";
import type { GestureRow, SponsorshipRow } from "../src/core/export-schema";
import { InputError, parseMuxMap } from "../src/core/inputs";
import { FIXTURE_DIR } from "./helpers";

const START = Date.parse("2026-10-04T12:00:00.000Z");
const SECONDS_AFTER_START = /^2026-10-04T12:00:0\d\.\d{3}Z$/;
const STATIC_RENDITIONS_PATH =
  /^\/video\/v1\/assets\/([^/]+)\/static-renditions$/;

/** A clock that only moves when the code sleeps. */
function fakeTimer(): { sleeps: number[]; timer: Timer } {
  let now = START;
  const sleeps: number[] = [];
  return {
    sleeps,
    timer: {
      now: () => now,
      sleep: (ms) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
    },
  };
}

function capture() {
  const lines: { error: string[]; log: string[] } = { error: [], log: [] };
  return {
    all: () => [...lines.log, ...lines.error].join("\n"),
    lines,
    out: {
      error: (text: string) => lines.error.push(text),
      log: (text: string) => lines.log.push(text),
    },
  };
}

function gesture(id: string, playbackId: string): GestureRow {
  return {
    _creationTime: 1_735_689_800_000,
    _id: id,
    categoryIds: [],
    concept: [],
    info: "",
    isActive: true,
    lastUpdated: 1_738_368_000_000,
    name: id,
    playbackId,
  };
}

function sponsorship(
  id: string,
  gestureId: string,
  videos: Pick<
    SponsorshipRow,
    | "originalVideoPlaybackId"
    | "previewVideoPlaybackId"
    | "sponsoredVideoPlaybackId"
    | "status"
  >
): SponsorshipRow {
  return {
    _creationTime: 1_736_000_000_000,
    _id: id,
    contactFullName: "Invented Person",
    createdAt: 1_736_000_000_000,
    durationYears: 1,
    endDate: 1_767_536_000_000,
    gestureId,
    overlayText: "Invented",
    paymentAmount: 5000,
    sponsorEmail: "invented@example.test",
    sponsorName: "Invented",
    startDate: 1_736_100_000_000,
    updatedAt: 1_736_100_000_000,
    ...videos,
  };
}

/**
 * Gesture g1 shows sponsorship s1's video (B1 restores `orig-1`); g2 has
 * its own video, which this Mux environment does not know.
 */
const EXPORT = {
  gestures: [gesture("g1", "spon-1"), gesture("g2", "gone-2")],
  sponsorships: [
    sponsorship("s1", "g1", {
      originalVideoPlaybackId: "orig-1",
      previewVideoPlaybackId: "prev-1",
      sponsoredVideoPlaybackId: "spon-1",
      status: "active",
    }),
  ],
};

let server: FakeMuxServer;
let dir: string;

beforeEach(() => {
  server = startFakeMuxServer({ readyAfterMs: 5 });
  dir = mkdtempSync(join(tmpdir(), "smog-mux-"));
});

afterEach(async () => {
  await server.stop();
  rmSync(dir, { force: true, recursive: true });
});

function context(timer: Timer, fetchImpl?: MuxContext["fetch"]): MuxContext {
  return {
    env: {
      MUX_API_URL: server.url,
      MUX_TOKEN_ID: FAKE_MUX_TOKEN.id,
      MUX_TOKEN_SECRET: FAKE_MUX_TOKEN.secret,
    },
    fetch: fetchImpl ?? ((input, init) => fetch(input, init)),
    timer,
  };
}

function addAsset(asset: Partial<FakeAsset>): FakeAsset {
  return server.fake.addAsset({ policy: "public", status: "ready", ...asset });
}

const HIGHEST = (status: string) => [
  { id: `r-${status}`, name: "highest.mp4", resolution: "highest", status },
];

describe("exportPlaybackIds", () => {
  test("gives every playback id its roles, with the gesture's resolved video", () => {
    expect(Object.fromEntries(exportPlaybackIds(EXPORT))).toEqual({
      "gone-2": ["gesture", "current"],
      "orig-1": ["gesture", "original"],
      "prev-1": ["preview"],
      "spon-1": ["current", "sponsored"],
    });
  });
});

describe("mux scan", () => {
  test("maps each playback id to its asset; an unknown one is null plus a warning", async () => {
    const original = addAsset({ playbackId: "orig-1" });
    const sponsored = addAsset({
      playbackId: "spon-1",
      staticRenditions: HIGHEST("ready"),
    });
    const preview = addAsset({ playbackId: "prev-1" });
    const { lines, out } = capture();

    const code = await runMuxScan(
      { data: EXPORT, outDir: dir },
      context(fakeTimer().timer),
      out
    );

    expect(code).toBe(0);
    const map = JSON.parse(readFileSync(join(dir, "mux-map.json"), "utf8"));
    expect(map).toEqual({
      "orig-1": {
        assetId: original.id,
        renditions: "absent",
        roles: ["gesture", "original"],
      },
      "prev-1": {
        assetId: preview.id,
        renditions: "absent",
        roles: ["preview"],
      },
      "spon-1": {
        assetId: sponsored.id,
        renditions: "ready",
        roles: ["current", "sponsored"],
      },
    });
    // The plan reads it as its --mux-map input.
    expect(parseMuxMap(JSON.stringify(map)).get("orig-1")?.assetId).toBe(
      original.id
    );
    const summary = JSON.parse(
      readFileSync(join(dir, "mux-scan.json"), "utf8")
    );
    expect(summary).toMatchObject({
      found: 3,
      playbackIds: 4,
      previewAssets: { all: 1, previewOnly: 1 },
      renditions: { absent: 1 },
      unknown: [{ playbackId: "gone-2", roles: ["gesture", "current"] }],
    });
    expect(lines.error).toEqual([
      "[migrate-convex] mux scan: warning: playback id gone-2 (gesture, current) is not in this Mux environment; the plan stores NULL for it.",
    ]);
    expect(lines.log.join("\n")).toContain("1 old preview asset(s)");
    // Read-only: GETs and nothing else.
    expect(
      server.fake.requests.every((request) => request.method === "GET")
    ).toBe(true);
  });

  test("throttles GETs to 2 per second by default and waits out a 429's Retry-After", async () => {
    addAsset({ playbackId: "orig-1" });
    server.fake.failNext(429, { "retry-after": "7" });
    const { sleeps, timer } = fakeTimer();
    const { lines, out } = capture();

    await runMuxScan({ data: EXPORT, outDir: dir }, context(timer), out);

    expect(sleeps).toContain(7000);
    // Every other wait is at most the GET throttle's 500 ms gap.
    const gaps = sleeps.filter((ms) => ms !== 7000);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((ms) => ms <= 500)).toBe(true);
    expect(gaps).toContain(500);
    // 4 lookups and 1 asset GET (1 found), plus the retried call.
    expect(server.fake.requests).toHaveLength(6);
    expect(lines.log).toContain(
      "[migrate-convex] Mux answered 429; waiting 7 s."
    );
  });

  test("names the missing credentials and never prints the token", async () => {
    const { out } = capture();
    const { timer } = fakeTimer();
    await expect(
      runMuxScan({ data: EXPORT, outDir: dir }, { env: {}, fetch, timer }, out)
    ).rejects.toThrow(
      "MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set in the environment"
    );
    const printed = capture();
    await runMuxScan(
      { data: EXPORT, outDir: dir },
      context(timer),
      printed.out
    );
    expect(printed.all()).not.toContain(FAKE_MUX_TOKEN.secret);
    expect(printed.all()).not.toContain(FAKE_MUX_TOKEN.id);
  });
});

describe("mux renditions", () => {
  /** One gesture asset per state, plus a sponsored one the command must leave alone. */
  function seed() {
    const assets = {
      absent: addAsset({ playbackId: "p-absent" }),
      conflict: addAsset({
        mp4Support: "capped-1080p",
        playbackId: "p-conflict",
        staticRenditions: [
          {
            id: "r-capped",
            name: "capped-1080p.mp4",
            resolution: null,
            status: null,
          },
        ],
        staticRenditionsStatus: "ready",
      }),
      errored: addAsset({
        playbackId: "p-errored",
        staticRenditions: HIGHEST("errored"),
      }),
      legacy: addAsset({
        mp4Support: "standard",
        playbackId: "p-legacy",
        staticRenditions: [
          { id: "r-high", name: "high.mp4", resolution: null, status: null },
        ],
        staticRenditionsStatus: "ready",
      }),
      preparing: addAsset({
        playbackId: "p-preparing",
        staticRenditions: HIGHEST("preparing"),
      }),
      ready: addAsset({
        playbackId: "p-ready",
        staticRenditions: HIGHEST("ready"),
      }),
      sponsored: addAsset({ playbackId: "p-sponsored" }),
    };
    const map: Record<string, unknown> = {};
    for (const [name, asset] of Object.entries(assets)) {
      map[`p-${name}`] = {
        assetId: asset.id,
        roles: name === "sponsored" ? ["sponsored"] : ["gesture"],
      };
    }
    map["p-deleted"] = { assetId: "asset-deleted", roles: ["gesture"] };
    const mapPath = join(dir, "mux-map.json");
    const mapText = JSON.stringify(map);
    writeFileSync(mapPath, mapText);
    return { assets, mapPath, mapText };
  }

  /**
   * Mux refuses a static rendition beside the deprecated `mp4_support`
   * (the task 4 review's carry); the fake does not model it, so this
   * `fetch` does, in front of the fake server.
   */
  const refused: string[] = [];

  function refusingBesideMp4(): MuxContext["fetch"] {
    refused.length = 0;
    return async (input, init) => {
      const url = new URL(String(input));
      const match = url.pathname.match(STATIC_RENDITIONS_PATH);
      const asset = match?.[1]
        ? server.fake.assets.get(decodeURIComponent(match[1]))
        : undefined;
      if (init?.method === "POST" && asset?.mp4Support) {
        refused.push(url.pathname);
        return Response.json(
          {
            error: {
              messages: ["static renditions cannot be used with mp4_support"],
              type: "invalid_parameters",
            },
          },
          { status: 400 }
        );
      }
      return await fetch(input, init);
    };
  }

  function posts(): string[] {
    return server.fake.requests
      .filter((request) => request.method === "POST")
      .map((request) => request.path);
  }

  test("targets only the gesture assets of the map", () => {
    const { assets, mapText } = seed();
    const targets = renditionTargets(mapText);
    expect(targets.size).toBe(7);
    expect(targets.has(assets.sponsored.id)).toBe(false);
  });

  test("refuses a map without roles (not written by mux scan)", () => {
    expect(() =>
      renditionTargets(JSON.stringify({ p: { assetId: "a" } }))
    ).toThrow(InputError);
    expect(() =>
      renditionTargets(
        JSON.stringify({ p: { assetId: "a", roles: ["preview"] } })
      )
    ).toThrow("The map has no gesture asset");
  });

  test("is dry by default: reads each state, posts nothing, writes no ledger", async () => {
    const { assets, mapPath, mapText } = seed();
    const { lines, out } = capture();

    const code = await runMuxRenditions(
      { apply: false, mapPath, mapText },
      context(fakeTimer().timer),
      out
    );

    expect(code).toBe(0);
    expect(posts()).toEqual([]);
    expect(existsSync(join(dir, RENDITIONS_LEDGER))).toBe(false);
    const log = lines.log.join("\n");
    expect(log).toContain(
      '"wouldRequest":3,"ready":1,"preparing":1,"legacy-mp4":1,"legacyMp4Conflict":0,"missing":1'
    );
    expect(log).toContain(`${assets.absent.id}`);
    expect(log).toContain(`${assets.conflict.id} (mp4_support capped-1080p)`);
    expect(log).toContain("Billable");
    expect(log).toContain("Run again with --apply");
  });

  test("--apply posts only for absent and errored, records a legacy mp4_support refusal, and keeps a ledger", async () => {
    const { assets, mapPath, mapText } = seed();
    const { lines, out } = capture();

    const code = await runMuxRenditions(
      { apply: true, mapPath, mapText },
      context(fakeTimer().timer, refusingBesideMp4()),
      out
    );

    const path = (asset: FakeAsset) =>
      `/video/v1/assets/${asset.id}/static-renditions`;
    expect(posts().sort()).toEqual(
      [path(assets.absent), path(assets.errored)].sort()
    );
    expect(refused).toEqual([path(assets.conflict)]);
    for (const request of server.fake.requests.filter(
      (entry) => entry.method === "POST"
    )) {
      expect(request.body).toEqual({ resolution: "highest" });
    }
    const ledger = JSON.parse(
      readFileSync(join(dir, RENDITIONS_LEDGER), "utf8")
    );
    expect(ledger.version).toBe(1);
    expect(ledger.entries[assets.absent.id]).toEqual({
      at: expect.stringMatching(SECONDS_AFTER_START),
      outcome: "requested",
      playbackId: "p-absent",
    });
    expect(ledger.entries[assets.conflict.id]).toMatchObject({
      detail: "mp4_support capped-1080p",
      outcome: "legacyMp4Conflict",
    });
    // The fake refuses a second `highest`; the errored one stays to the owner.
    expect(ledger.entries[assets.errored.id]).toMatchObject({
      detail: "Mux answered 400",
      outcome: "failed",
    });
    // Nothing was changed on the conflicting asset.
    expect(server.fake.assets.get(assets.conflict.id)?.mp4Support).toBe(
      "capped-1080p"
    );
    expect(code).toBe(1);
    expect(lines.error.join("\n")).toContain("legacyMp4Conflict");
  });

  test("a re-run skips what the ledger says was requested", async () => {
    const { assets, mapPath, mapText } = seed();
    await runMuxRenditions(
      { apply: true, mapPath, mapText },
      context(fakeTimer().timer, refusingBesideMp4()),
      capture().out
    );
    server.fake.requests.length = 0;
    const { lines, out } = capture();

    await runMuxRenditions(
      { apply: true, mapPath, mapText },
      context(fakeTimer().timer, refusingBesideMp4()),
      out
    );

    const touched = new Set(
      server.fake.requests.map((request) => request.path.split("/")[4])
    );
    expect(touched.has(assets.absent.id)).toBe(false);
    // A conflict and a failure are looked at again.
    expect(touched.has(assets.conflict.id)).toBe(true);
    expect(touched.has(assets.errored.id)).toBe(true);
    expect(lines.log.join("\n")).toContain('"ledger":1');
  });

  test("waits out a 429 on the post and then requests", async () => {
    const absent = addAsset({ playbackId: "p-absent" });
    const mapPath = join(dir, "mux-map.json");
    const mapText = JSON.stringify({
      "p-absent": { assetId: absent.id, roles: ["gesture"] },
    });
    const { sleeps, timer } = fakeTimer();
    // The asset GET passes; the POST is rate limited once.
    let calls = 0;
    const limited: MuxContext["fetch"] = async (input, init) => {
      calls += 1;
      if (calls === 2) {
        return Response.json(
          { error: { messages: ["slow down"], type: "rate_limited" } },
          { headers: { "retry-after": "3" }, status: 429 }
        );
      }
      return await fetch(input, init);
    };

    const code = await runMuxRenditions(
      { apply: true, mapPath, mapText },
      context(timer, limited),
      capture().out
    );

    expect(code).toBe(0);
    expect(sleeps).toContain(3000);
    expect(posts()).toEqual([
      `/video/v1/assets/${absent.id}/static-renditions`,
    ]);
  });
});

describe("the rate-limit buckets (task 9 review)", () => {
  /** The virtual time of each request, by method. */
  function timed(timer: Timer): {
    fetch: MuxContext["fetch"];
    times: { method: string; at: number }[];
  } {
    const times: { method: string; at: number }[] = [];
    return {
      fetch: (input, init) => {
        times.push({ at: timer.now(), method: init?.method ?? "GET" });
        return fetch(input, init);
      },
      times,
    };
  }

  test("--apply posts at most once per second, apart from the GETs", async () => {
    const assets = [1, 2, 3].map((n) => addAsset({ playbackId: `p-${n}` }));
    const mapPath = join(dir, "mux-map.json");
    const mapText = JSON.stringify(
      Object.fromEntries(
        assets.map((asset, n) => [
          `p-${n}`,
          { assetId: asset.id, roles: ["gesture"] },
        ])
      )
    );
    const { timer } = fakeTimer();
    const { fetch: timedFetch, times } = timed(timer);

    await runMuxRenditions(
      { apply: true, mapPath, mapText },
      context(timer, timedFetch),
      capture().out
    );

    const posts = times.filter((entry) => entry.method === "POST");
    const gets = times.filter((entry) => entry.method === "GET");
    expect(posts).toHaveLength(3);
    for (const [index, entry] of posts.entries()) {
      if (index > 0) {
        expect(entry.at - (posts[index - 1]?.at ?? 0)).toBeGreaterThanOrEqual(
          1000
        );
      }
    }
    for (const [index, entry] of gets.entries()) {
      if (index > 0) {
        expect(entry.at - (gets[index - 1]?.at ?? 0)).toBeGreaterThanOrEqual(
          500
        );
      }
    }
  });

  test("--get-rate sets the GET pace", async () => {
    addAsset({ playbackId: "orig-1" });
    const { sleeps, timer } = fakeTimer();
    await main(
      ["mux", "scan", "--export", FIXTURE_DIR, "--out", dir, "--get-rate", "1"],
      capture().out,
      context(timer)
    );
    expect(sleeps).toContain(1000);
    expect(sleeps.every((ms) => ms <= 1000)).toBe(true);
  });
});

describe("migrate:convex mux scan", () => {
  test("reads the fixture export and writes a map the plan accepts", async () => {
    addAsset({ playbackId: "fixtureOriginalPlayback0001" });
    const code = await main(
      ["mux", "scan", "--export", FIXTURE_DIR, "--out", dir],
      capture().out,
      context(fakeTimer().timer)
    );
    expect(code).toBe(0);
    const map = parseMuxMap(readFileSync(join(dir, "mux-map.json"), "utf8"));
    expect(map.get("fixtureOriginalPlayback0001")?.assetId).toBeDefined();
  });
});
