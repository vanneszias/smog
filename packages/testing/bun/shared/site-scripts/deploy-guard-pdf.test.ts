import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  checkPdfEngineIsLazy,
  checkPdfEngineStaysOnTheServer,
  PDF_ENGINE_MARKERS,
  UNPDF_MARKERS,
} from "../../../../../apps/site/scripts/deploy-guard";

/**
 * The PDF engine is a Worker-only, lazily imported chunk (phase 10c task 5b,
 * plan ruling 4): no browser file carries `pdf-lib` or fontkit, `unpdf`
 * ships nowhere, and no file imports the engine's chunk statically.
 */

const CLIENT = join("dist", "client");

function file(path: string, content: string) {
  return { content, path: join("dist", path) };
}

describe("checkPdfEngineStaysOnTheServer", () => {
  it("passes a Worker chunk with the engine and a clean browser build", () => {
    expect(() =>
      checkPdfEngineStaysOnTheServer(
        [
          file("server/assets/src-a.js", 'x("Failed to parse PDF document")'),
          file("client/assets/main.js", "export const a = 1"),
        ],
        CLIENT
      )
    ).not.toThrow();
  });

  it("refuses pdf-lib and fontkit in any browser file", () => {
    for (const { marker, name } of PDF_ENGINE_MARKERS) {
      expect(() =>
        checkPdfEngineStaysOnTheServer(
          [file("client/assets/lazy.js", `x(${JSON.stringify(marker)})`)],
          CLIENT
        )
      ).toThrow(name);
    }
  });

  it("refuses unpdf anywhere, the Worker included", () => {
    for (const { marker } of UNPDF_MARKERS) {
      for (const path of ["server/index.js", "client/assets/a.js"]) {
        expect(() =>
          checkPdfEngineStaysOnTheServer(
            [file(path, `x(${JSON.stringify(marker)})`)],
            CLIENT
          )
        ).toThrow("unpdf");
      }
    }
  });
});

describe("checkPdfEngineIsLazy", () => {
  const engine = file(
    "server/assets/src-D09hFIe0.js",
    'x("Unknown font format")'
  );

  it("passes a dynamic import of the engine chunk", () => {
    expect(() =>
      checkPdfEngineIsLazy([
        engine,
        file(
          "server/assets/server-1.js",
          'const m = await Promise.all([import("../../../../../apps/site/scripts/src-D09hFIe0.js"), b()]);'
        ),
      ])
    ).not.toThrow();
  });

  it("passes a build without the engine at all", () => {
    expect(() =>
      checkPdfEngineIsLazy([file("server/index.js", "export default {}")])
    ).not.toThrow();
  });

  it("refuses a static import, named, namespace or bare", () => {
    for (const code of [
      'import { a } from "../../../../../apps/site/scripts/assets/src-D09hFIe0.js";',
      'import*as p from"../../../../../apps/site/scripts/src-D09hFIe0.js";',
      'import"../../../../../apps/site/scripts/src-D09hFIe0.js";',
      'export { b } from "../../../../../apps/site/assets/src-D09hFIe0.js";',
    ]) {
      expect(() =>
        checkPdfEngineIsLazy([engine, file("server/index.js", code)])
      ).toThrow("imported statically");
    }
  });

  it("is not fooled by a chunk whose name merely ends the same way", () => {
    expect(() =>
      checkPdfEngineIsLazy([
        engine,
        file(
          "server/index.js",
          'import { a } from "../../../../../apps/site/scripts/other-src-D09hFIe0.jsx";'
        ),
      ])
    ).not.toThrow();
  });
});
