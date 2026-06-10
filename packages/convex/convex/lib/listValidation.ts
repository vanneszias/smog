export function normalizeListName(name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 80) {
    throw new Error("List name must be between 1 and 80 characters");
  }
  return normalized;
}

export function normalizeListDescription(description?: string) {
  const normalized = description?.trim();
  if (normalized && normalized.length > 280) {
    throw new Error("List description cannot exceed 280 characters");
  }
  return normalized || undefined;
}

export function validateReorderPayload(
  currentGestureIds: readonly string[],
  reorderedGestureIds: readonly string[]
) {
  const currentIds = new Set(currentGestureIds);
  const reorderedIds = new Set(reorderedGestureIds);
  if (
    currentIds.size !== reorderedGestureIds.length ||
    reorderedIds.size !== reorderedGestureIds.length ||
    reorderedGestureIds.some((gestureId) => !currentIds.has(gestureId))
  ) {
    throw new Error(
      "Reorder payload must include every list item exactly once"
    );
  }
}
