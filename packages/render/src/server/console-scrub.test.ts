/**
 * Review I-1: Remotion logs through `console.*` itself (`Log.warn` /
 * `Log.error`), bypassing the server's `RenderLog`, and its messages name
 * the signed source URL. `scrubConsole` makes every console line URL-free.
 */
import { describe, expect, it } from "bun:test";
import { scrubConsole } from "./console-scrub";

const SIGNED = "https://master.mux.com/abc/master.mp4?token=SECRET-SIG";
const PROXY = `http://localhost:3000/proxy?src=${encodeURIComponent(SIGNED)}&time=1.2&transparent=false`;

function capture() {
  const lines: unknown[][] = [];
  const record =
    (level: string) =>
    (...args: unknown[]): void => {
      lines.push([level, ...args]);
    };
  const target = {
    debug: record("debug"),
    error: record("error"),
    info: record("info"),
    log: record("log"),
    warn: record("warn"),
  };
  scrubConsole(target);
  return { lines, target };
}

describe("scrubConsole", () => {
  it("scrubs Remotion's own download and resource lines", () => {
    const { lines, target } = capture();
    // `@remotion/renderer` download-file.js
    target.warn(`Downloading ${SIGNED} failed (will retry): socket hang up`);
    // `BrowserPage.js`: the tag is the failed resource (the proxy URL).
    target.error(
      `\u001b[90m[${PROXY}]\u001b[39m`,
      "Failed to load resource: the server responded with a status of 500 ()"
    );
    target.log(`Rendered frame from ${PROXY}`);
    const text = JSON.stringify(lines);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("master.mux.com");
    expect(lines[0]).toEqual([
      "warn",
      "Downloading <url> failed (will retry): socket hang up",
    ]);
    expect(lines[1]?.[2]).toBe(
      "Failed to load resource: the server responded with a status of 500 ()"
    );
  });

  it("turns an Error into its scrubbed name and message, never the cause", () => {
    const { lines, target } = capture();
    target.error(
      "Could not extract frame from compositor",
      new Error(`No such file: ${SIGNED}`, { cause: new Error(SIGNED) })
    );
    expect(lines[0]).toEqual([
      "error",
      "Could not extract frame from compositor",
      "Error: No such file: <url>",
    ]);
  });

  it("scrubs objects through their inspected form and keeps numbers", () => {
    const { lines, target } = capture();
    target.info({ src: SIGNED }, 42, true);
    expect(JSON.stringify(lines)).not.toContain("SECRET");
    expect(lines[0]?.slice(2)).toEqual([42, true]);
  });
});
