import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";

describe("/dev/ui", () => {
  it("server-renders the component gallery in dev (nl by default)", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/dev/ui`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Componentengalerij");
    // Light and dark side by side.
    expect(html).toContain('class="dark');
  });

  it("takes the language from ?lang", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/dev/ui?lang=en`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Component gallery");
  });
});
