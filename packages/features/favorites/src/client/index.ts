// biome-ignore-all lint/performance/noBarrelFile: the `@smog/favorites/client` entry point (site + mobile).
/**
 * `@smog/favorites/client`: one platform-neutral hook for favorites. It
 * uses the API when signed in and the local store for guests, so screens
 * never branch on it. Never imports ./server.
 */
export {
  FAVORITES_STALE_TIME,
  type Favorites,
  type FavoritesStatus,
  type UseFavoritesOptions,
  useFavorites,
} from "./use-favorites";
