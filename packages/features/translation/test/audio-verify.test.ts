import { describe, expect, it } from "vitest";
import { inspectAudio } from "../src/server/audio-verify";
import { m4aBytes, mp3Bytes } from "../src/testing";

describe("inspectAudio", () => {
  it("reads an MP3 and its duration from the frames", () => {
    const verdict = inspectAudio(mp3Bytes(2));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.contentType).toBe("audio/mpeg");
      expect(verdict.durationMs).toBeGreaterThan(1900);
      expect(verdict.durationMs).toBeLessThan(2100);
    }
  });

  it("skips an ID3v2 tag", () => {
    expect(inspectAudio(mp3Bytes(1, { id3: true })).ok).toBe(true);
  });

  it("reads an M4A and its duration from the movie header", () => {
    expect(inspectAudio(m4aBytes(3))).toEqual({
      contentType: "audio/mp4",
      durationMs: 3000,
      ok: true,
    });
  });

  it("refuses a clip longer than ten seconds, either format", () => {
    expect(inspectAudio(mp3Bytes(11))).toEqual({
      ok: false,
      reason: "duration",
    });
    expect(inspectAudio(m4aBytes(10.5))).toEqual({
      ok: false,
      reason: "duration",
    });
  });

  it("measures an M4A by its samples, so an understated movie header does not pass", () => {
    // mvhd says 1 s, the sample tables say 12 minutes.
    expect(inspectAudio(m4aBytes(1, "soun", { samplesSeconds: 720 }))).toEqual({
      ok: false,
      reason: "duration",
    });
    // And the other way round: the longest stated length counts.
    expect(inspectAudio(m4aBytes(12, "soun", { samplesSeconds: 1 }))).toEqual({
      ok: false,
      reason: "duration",
    });
    expect(inspectAudio(m4aBytes(3, "soun", { samplesSeconds: 3 })).ok).toBe(
      true
    );
  });

  it("refuses an audio track without a time-to-sample table", () => {
    const bytes = m4aBytes(2);
    const at = new TextDecoder("latin1").decode(bytes).indexOf("stts");
    expect(at).toBeGreaterThan(0);
    // Rename `stts` so the track has none.
    bytes.set(new TextEncoder().encode("free"), at);
    expect(inspectAudio(bytes)).toEqual({ ok: false, reason: "format" });
  });

  it("accepts exactly ten seconds", () => {
    expect(inspectAudio(m4aBytes(10)).ok).toBe(true);
  });

  it("refuses what is neither (wrong magic bytes)", () => {
    const text = new TextEncoder().encode("<html>not audio at all</html>");
    expect(inspectAudio(text)).toEqual({ ok: false, reason: "format" });
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(inspectAudio(png)).toEqual({ ok: false, reason: "format" });
    expect(inspectAudio(new Uint8Array(0))).toEqual({
      ok: false,
      reason: "format",
    });
  });

  it("refuses an MP3 header followed by something else", () => {
    const bytes = new Uint8Array(5000);
    bytes.set([0xff, 0xfb, 0x90, 0x00]);
    expect(inspectAudio(bytes)).toEqual({ ok: false, reason: "format" });
  });

  it("refuses an ISO media file that is not audio only", () => {
    expect(inspectAudio(m4aBytes(2, "vide"))).toEqual({
      ok: false,
      reason: "format",
    });
  });

  it("refuses an ISO media file cut before its movie box", () => {
    const whole = m4aBytes(2);
    expect(inspectAudio(whole.slice(0, 60))).toEqual({
      ok: false,
      reason: "format",
    });
  });
});
