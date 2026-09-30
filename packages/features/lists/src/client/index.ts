// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lists/client` entry point (site + mobile).
/**
 * `@smog/lists/client`: platform-neutral hooks. Signed in, they use the
 * typed `lists` slice (TanStack Query); guests get their lists from the
 * device (`@smog/local-store`). Sharing needs an account. Never imports
 * ./server.
 */
export {
  BY_IDS_CHUNK,
  LISTS_STALE_TIME,
  type ListsQueryUtils,
  type ListsSlice,
  SHARED_LIST_STALE_TIME,
} from "./slice";
export { type UpdateListInput, type UseListResult, useList } from "./use-list";
export {
  type CreateListInput,
  type ListsStatus,
  type UseListsResult,
  useLists,
} from "./use-lists";
export {
  type ShareLinksRequireAccount,
  type ShareLinksState,
  type UseShareLinksResult,
  useShareLinks,
} from "./use-share-links";
export {
  sharedListOptions,
  type UseSharedListResult,
  useSharedList,
} from "./use-shared-list";
