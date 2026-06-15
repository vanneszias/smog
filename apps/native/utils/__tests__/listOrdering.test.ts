import { moveListItem } from "../listOrdering";

describe("moveListItem", () => {
  it("moves an item one position in either direction", () => {
    expect(moveListItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveListItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("keeps the order when the move is outside the list", () => {
    expect(moveListItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveListItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});
