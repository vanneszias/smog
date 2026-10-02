import { describe, expect, it } from "bun:test";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes the five markup characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });

  it("escapes & first, so an entity is not decoded later", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves other text alone", () => {
    expect(escapeHtml("Café 👋 \u0000")).toBe("Café 👋 \u0000");
  });
});
