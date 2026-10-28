/**
 * The real favorites and lists statement builders, as `@smog/api` wires
 * them, so these tests run the exact statements production composes. A
 * feature may not depend on another feature's `./server`, and `@smog/api`
 * (the composition root) has no D1 in its tests, so this test-only file
 * reaches the builders by relative path (see docs/DECISIONS.md, Account).
 */

import type {
  AccountRouterDeps,
  ImportDeps,
} from "../../../../features/account/src/server/index";
import { insertFavoritesStmt } from "../../../../features/favorites/src/server/service";
import {
  appendItemsStmt,
  insertListsStmt,
  touchListsWithNewItemsStmt,
  unplacedItemsStmt,
} from "../../../../features/lists/src/server/service";
import { shareUrl } from "../../../../features/lists/src/server/sharing";

export const importDeps: ImportDeps = {
  appendItems: appendItemsStmt,
  insertFavorites: insertFavoritesStmt,
  insertLists: insertListsStmt,
  touchLists: touchListsWithNewItemsStmt,
  unplacedItems: unplacedItemsStmt,
};

/** Everything `@smog/api` wires into `createAccountRouter`. */
export const accountDeps: AccountRouterDeps = {
  ...importDeps,
  shareUrl,
};
