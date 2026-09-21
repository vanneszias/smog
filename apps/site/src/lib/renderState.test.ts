import { describe, expect, it } from "vitest";
import { Renders } from "@/collections/Renders";
import { canAdvance, RENDER_STATES, type RenderState } from "@/lib/renderState";

/** The `state` column's options, read off the shipped collection config. */
function collectionStates(): string[] {
  const field = Renders.fields.find(
    (candidate) => "name" in candidate && candidate.name === "state"
  );

  if (field === undefined || field.type !== "select") {
    throw new Error("`renders` has no `state` select field");
  }

  return field.options.map((option) =>
    typeof option === "string" ? option : option.value
  );
}

describe("the render state table", () => {
  it("covers every state the collection can hold", () => {
    // The table and the column are two halves of one decision, and nothing
    // else makes them agree: adding `retrying` to the collection's options
    // without adding a row to `ALLOWED_RENDER_TRANSITIONS` gives
    // `canAdvance` an `undefined` list to call `.includes` on, which throws
    // at whatever moment that state first turns up — inside a callback, in
    // production, holding a finished render nobody will pay to do twice.
    expect(collectionStates()).toEqual([...RENDER_STATES]);
  });

  it("lets a queued render start and finish", () => {
    expect(canAdvance("queued", "rendering")).toBe(true);
    expect(canAdvance("rendering", "uploading")).toBe(true);
    expect(canAdvance("uploading", "ready")).toBe(true);
    // Nothing in this application observes a render starting — there is no
    // poller, and Lambda's callback is the first news, which is that the
    // render finished. So the skip is legal on purpose.
    expect(canAdvance("queued", "uploading")).toBe(true);
    // Lambda can report a failure at any point before the upload, including
    // before it started.
    expect(canAdvance("queued", "failed")).toBe(true);
    expect(canAdvance("rendering", "failed")).toBe(true);
    expect(canAdvance("uploading", "failed")).toBe(true);
  });

  it("refuses ready -> rendering", () => {
    expect(canAdvance("ready", "rendering")).toBe(false);
  });

  it("refuses a render that skips the upload", () => {
    // `ready` means a Mux asset exists and plays. The only code that can know
    // that is the code that uploaded it, and it passes through `uploading` on
    // the way — so this edge is what stops a sponsorship being pointed at an
    // asset that was never created. Stage 6 exit criterion 7.
    expect(canAdvance("rendering", "ready")).toBe(false);
    expect(canAdvance("queued", "ready")).toBe(false);
  });

  it("treats a state staying put as allowed", () => {
    // Every update re-submits the whole document — Payload fills absent
    // fields from `originalDoc` before `beforeChange` runs — so recording a
    // failure reason against an already-`failed` render arrives here as
    // `failed -> failed`. Refusing it would make the row unwritable.
    for (const state of RENDER_STATES) {
      expect(canAdvance(state, state)).toBe(true);
    }
  });

  it("lets nothing out of ready or failed", () => {
    const terminal: RenderState[] = ["ready", "failed"];

    for (const from of terminal) {
      for (const to of RENDER_STATES) {
        if (to === from) {
          continue;
        }

        expect(canAdvance(from, to)).toBe(false);
      }
    }

    // The positive beside the negative: a table that answered `false` to
    // everything would satisfy the loop above while making every render
    // unfinishable, and only this line tells the two apart. Retrying a
    // finished render is a new job id and a new row, which is why the
    // terminal states need no way out.
    expect(
      RENDER_STATES.filter((state) => canAdvance(state, "failed"))
    ).toEqual(["queued", "rendering", "uploading", "failed"]);
  });
});
