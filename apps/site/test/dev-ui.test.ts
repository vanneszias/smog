import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { devUiEnabled } from "../src/server/dev-tools";

const ORIGIN = "http://localhost:5173";
// The first /dev/ui request also transforms the kit and the gallery (lazy,
// on demand): up to ~40 s when the test files run in parallel.
const FIRST_RENDER_TIMEOUT = 120_000;

describe("/dev/ui", () => {
  it(
    "server-renders the component gallery in dev (nl by default)",
    async () => {
      const response = await exports.default.fetch(`${ORIGIN}/dev/ui`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Componentengalerij");
      // Light and dark side by side.
      expect(html).toContain('class="dark');
    },
    FIRST_RENDER_TIMEOUT
  );

  it("takes the language from ?lang", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/dev/ui?lang=en`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Component gallery");
  });
});

describe("devUiEnabled", () => {
  it("is on in dev and staging, off in production (spec §9)", () => {
    expect(devUiEnabled("dev")).toBe(true);
    expect(devUiEnabled("staging")).toBe(true);
    expect(devUiEnabled("production")).toBe(false);
  });
});
