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
 *
 * `summaryBody` walks brace depth rather than stopping at the first `}`: an
 * early version stopped there, which is correct only when no field's own
 * type contains a nested `{ ... }` — `categories`' inline
 * `readonly { id: string; name: string }[]` closes one before the interface
 * itself does, so a first-`}` scan silently loses `categories` (and anything
 * after it) from the comparison. Counting depth instead reads all the way to
 * the interface's own closing brace, so `categories`' own nested `id`/`name`
 * lines are captured too — which is fine, and actually desirable: it means a
 * change to that nested shape fails the comparison as well.
 */
function summaryBody(source: string): string {
  const start = source.indexOf("GestureSummary");
  const open = source.indexOf("{", start);
  let depth = 0;

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") {
      depth += 1;
    } else if (source[i] === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(open + 1, i);
      }
    }
  }

  throw new Error("GestureSummary's declaration is unterminated");
}

function summaryFields(source: string): string[] {
  return summaryBody(source)
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

  /*
   * Four lines: `id`, `name`, `categories` and `playbackId` — all four of
   * `GestureSummary`'s own fields. `categories`' inline
   * `{ id: string; name: string }` sits on the same source line as the
   * `categories` field itself, so it is part of that one field's text
   * rather than lines of its own — but it is now part of the comparison at
   * all, which a first-`}` scan could never reach. A path typo would make
   * both sides `[]`, which is not `4`, so the count is asserted exactly
   * rather than merely "more than a couple", to fail loudly rather than
   * pass by coincidence.
   */
  it("finds all four of GestureSummary's fields, not the two a broken scan used to stop at", () => {
    expect(summaryFields(readFileSync(WEB, "utf8")).length).toBe(4);
  });
});
