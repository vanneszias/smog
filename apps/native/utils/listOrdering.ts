export function moveListItem<T>(
  items: readonly T[],
  currentIndex: number,
  direction: -1 | 1
): T[] {
  const nextIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    currentIndex >= items.length ||
    nextIndex < 0 ||
    nextIndex >= items.length
  ) {
    return [...items];
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(currentIndex, 1);
  if (item === undefined) {
    return [...items];
  }
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}
