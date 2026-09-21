import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens } from "@smog/styles";
import { renderTailwindConfig } from "./theme";

const CONFIG = join(__dirname, "..", "tailwind.config.js");

describe("tailwind.config.js", () => {
  it("is byte-identical to what the generator produces", () => {
    expect(readFileSync(CONFIG, "utf8")).toBe(renderTailwindConfig());
  });

  it("carries the light semantic roles", () => {
    const config = renderTailwindConfig();

    expect(config).toContain(`"surface": "${tokens.semantic.light.surface}"`);
    expect(config).toContain(`"primary": "${tokens.semantic.light.primary}"`);
  });

  it("carries the dark semantic roles under a dark key", () => {
    const config = renderTailwindConfig();

    expect(config).toContain(
      `"surface-dark": "${tokens.semantic.dark.surface}"`
    );
  });

  it("does not silently agree when a role is missing", () => {
    expect(renderTailwindConfig()).not.toContain('"surface": undefined');
  });

  it("renders every spacing step", () => {
    const config = renderTailwindConfig();

    for (const [step, value] of Object.entries(tokens.spacing)) {
      expect(config).toContain(`"${step}": "${value}px"`);
    }
  });
});
