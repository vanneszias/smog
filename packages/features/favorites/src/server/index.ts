// biome-ignore-all lint/performance/noBarrelFile: the `@smog/favorites/server` entry point (Worker only).
export { createFavoritesRouter, type FavoritesRouterDeps } from "./router";
export {
  addFavorite,
  type FavoritesDeps,
  type FindGestureSummaries,
  GestureNotFoundError,
  InvalidCursorError,
  listFavoriteIds,
  listFavorites,
  removeFavorite,
  toggleFavorite,
} from "./service";
