/**
 * A second export for the reset tests (phase 9 ruling 10): the fixture with
 * every Convex id changed (one character of its run of zeros), so its rows
 * are "another export's import" that holds the same slugs, addresses and
 * tokens under other legacy ids. The storage ids stay (they name files).
 * Pure text, so the Bun and the Workers-pool suites both use it.
 */

const CONVEX_ID = /\b([jk][a-y]7[a-z0-9]{27,28})\b/g;
const CHANGED_AT = 10;

/** `text` with every Convex id replaced by its sibling (injective). */
export function otherExportText(text: string): string {
  return (
    text
      .replace(CONVEX_ID, (id) => {
        if (id[CHANGED_AT] !== "0") {
          throw new Error(`The fixture id ${id} has no 0 at ${CHANGED_AT}`);
        }
        return `${id.slice(0, CHANGED_AT)}b${id.slice(CHANGED_AT + 1)}`;
      })
      // The checkouts' ids come from the Mollie ids: another export, other payments.
      .replaceAll("tr_fixture", "tr_otherfx")
  );
}
