import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `GestureSummary` is declared twice — once in each component library —
 * because importing the web one would pull a module graph that reaches
 * `@mux/mux-player-react` into a React Native bundle. Two declarations of
 * one type is exactly the drift this repository keeps catching, so the two
 * are compared as text.
 *
 * The comparison is deliberately crude: it normalises whitespace and
 * compares the field lines. A rename, an added field or a changed optionality
 * fails it. A reordering does not, which is the one difference worth
 * tolerating to keep this readable.
 */
function summaryFields(source: string): string[] {
  const body = source.slice(
    source.indexOf("GestureSummary"),
    source.indexOf("}", source.indexOf("GestureSummary"))
  );

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(";"))
    .sort();
}

const WEB = join(__dirname, "../../../ui-web/src/domain/GestureCard.tsx");
const NATIVE = join(__dirname, "GestureCard.tsx");

describe("GestureSummary", () => {
  it("declares the same fields on both platforms", () => {
    expect(summaryFields(readFileSync(NATIVE, "utf8"))).toEqual(
      summaryFields(readFileSync(WEB, "utf8"))
    );
  });

  it("found something to compare", () => {
    // A path typo would make both sides `[]` and the test above vacuous.
    expect(summaryFields(readFileSync(WEB, "utf8")).length).toBeGreaterThan(2);
  });
});
