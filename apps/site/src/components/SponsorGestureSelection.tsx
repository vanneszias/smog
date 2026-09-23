"use client";

import { GestureGrid, type GestureSummary } from "@smog/ui-web";

/**
 * The selection grid, wrapped so it can be given a checkbox.
 *
 * `GestureGrid` takes `renderGestureLink`, a *function*, and a function
 * cannot be serialized across the server/client boundary — so the page cannot
 * hand it one and this wrapper exists to supply it, exactly as
 * `GestureResults` does for the gestures list. The rows are still fetched on
 * the server; what crosses the boundary is plain data.
 *
 * **The control is a real `<input type="checkbox">`, not `@smog/ui-web`'s
 * `Checkbox`.** That component is Radix's, which renders a `<button>` and
 * keeps its state in React — invisible to a form submission and useless with
 * scripting off. This whole wizard is `<form method="post">` and nothing
 * else, so the control has to be the element a form knows how to send.
 *
 * Every box shares the name `gestureId`, which is how a form says "a list":
 * the endpoint reads them with `FormData.getAll`.
 */
export function SponsorGestureSelection({
  gestures,
  label,
  selectedIds,
}: {
  gestures: readonly GestureSummary[];
  label: string;
  selectedIds: readonly string[];
}) {
  const selected = new Set(selectedIds);

  return (
    <GestureGrid
      data-testid="sponsor-selectable"
      emptyDescription="Pas je zoekopdracht of je filters aan."
      emptyTitle="Geen beschikbare gebaren gevonden"
      gestures={gestures}
      label={label}
      renderGestureLink={(gesture, children) => (
        <label className="flex items-center gap-2">
          <input
            className="size-4 shrink-0 accent-primary"
            data-testid="sponsor-gesture-checkbox"
            defaultChecked={selected.has(gesture.id)}
            name="gestureId"
            type="checkbox"
            value={gesture.id}
          />
          <span className="truncate">{children}</span>
        </label>
      )}
    />
  );
}
