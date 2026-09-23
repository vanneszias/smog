import type { DocToSync } from "@payloadcms/plugin-search/types";
import { describe, expect, it } from "vitest";
import { beforeSyncGesture } from "./beforeSync";

/**
 * The `searchDoc` the plugin hands to `beforeSync` is never `{}` — it is
 * always `{ doc: { relationTo, value }, title }`, built in
 * `plugin-search/dist/utilities/syncDocAsSearchIndex.js` (3.89.0) before the
 * hook is called. Building the same shape here keeps the unit test honest
 * about its input, and lets one of the cases below assert the part of it
 * that must survive the transform.
 */
const searchDoc = (): DocToSync => ({
  doc: { relationTo: "gestures", value: "1" },
  title: "",
});

const gesture = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Hallo",
  concepts: ["hoi", "dag"],
  isActive: true,
  ...overrides,
});

describe("beforeSyncGesture", () => {
  it("copies the gesture name into the search title", () => {
    const result = beforeSyncGesture({
      originalDoc: gesture(),
      searchDoc: searchDoc(),
    });

    expect(result.title).toBe("Hallo");
  });

  it("flattens concepts into a searchable string", () => {
    const result = beforeSyncGesture({
      originalDoc: gesture(),
      searchDoc: searchDoc(),
    });

    expect(result.concepts).toBe("hoi dag");
  });

  it("handles a gesture with no concepts", () => {
    const result = beforeSyncGesture({
      originalDoc: gesture({ concepts: undefined }),
      searchDoc: searchDoc(),
    });

    expect(result.concepts).toBe("");
  });

  it("marks inactive gestures so they can be filtered out", () => {
    const result = beforeSyncGesture({
      originalDoc: gesture({ isActive: false }),
      searchDoc: searchDoc(),
    });

    expect(result.isActive).toBe(false);
  });

  it("treats an unset isActive as inactive, matching publicReadActive", () => {
    // `publicReadActive` uses `equals: true`, so a NULL `isActive` gesture is
    // hidden rather than published. The index must make the same call or a
    // gesture nobody can read would still be findable through search.
    const result = beforeSyncGesture({
      originalDoc: gesture({ isActive: undefined }),
      searchDoc: searchDoc(),
    });

    expect(result.isActive).toBe(false);
  });

  it("falls back to an empty title when the gesture has no name", () => {
    const result = beforeSyncGesture({
      originalDoc: gesture({ name: undefined }),
      searchDoc: searchDoc(),
    });

    expect(result.title).toBe("");
  });

  it("keeps the doc relationship the plugin put on the search doc", () => {
    // Dropping this loses the link back to the gesture, which is what both
    // the update path and `deleteFromSearch` look the index entry up by.
    const result = beforeSyncGesture({
      originalDoc: gesture(),
      searchDoc: searchDoc(),
    });

    expect(result.doc).toEqual({ relationTo: "gestures", value: "1" });
  });
});
