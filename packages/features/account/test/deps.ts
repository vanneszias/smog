/**
 * The real favorites and lists statement builders, as `@smog/api` wires
 * them, so these tests run the exact statements production composes. A
 * feature may not depend on another feature's `./server`, and `@smog/api`
 * (the composition root) has no D1 in its tests, so this test-only file
 * reaches the builders by relative path (see docs/DECISIONS.md, Account).
 */
import { insertFavoritesStmt } from "../../favorites/src/server/service";
import {
  appendItemsStmt,
  insertListsStmt,
  touchListsWithNewItemsStmt,
  unplacedItemsStmt,
} from "../../lists/src/server/service";
import type { ImportDeps } from "../src/server";

export const importDeps: ImportDeps = {
  appendItems: appendItemsStmt,
  insertFavorites: insertFavoritesStmt,
  insertLists: insertListsStmt,
  touchLists: touchListsWithNewItemsStmt,
  unplacedItems: unplacedItemsStmt,
};
