/**
 * In-memory cache for categories data
 * Reduces Convex queries by caching category data with TTL
 * Safe: Automatically invalidated when categories are modified
 */

interface CachedCategory {
  _id: string;
  _creationTime: number;
  name: string;
  isActive: boolean;
}

interface CacheEntry {
  data: CachedCategory[];
  expiresAt: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour

class CategoriesCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number;
  private readonly allCategoriesKey = "_all_categories";

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Get categories by IDs from cache or return null if expired/missing
   */
  getByIds(ids: string[]): CachedCategory[] | null {
    // Create a sorted, unique key for consistency
    const cacheKey = this.createKey(ids);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.data;
  }

  /**
   * Set categories in cache
   */
  setByIds(ids: string[], categories: CachedCategory[]): void {
    const cacheKey = this.createKey(ids);
    this.cache.set(cacheKey, {
      data: categories,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Get all active categories from cache
   */
  getAllActive(): CachedCategory[] | null {
    const entry = this.cache.get(this.allCategoriesKey);

    if (!entry) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(this.allCategoriesKey);
      return null;
    }

    return entry.data;
  }

  /**
   * Set all active categories in cache
   */
  setAllActive(categories: CachedCategory[]): void {
    this.cache.set(this.allCategoriesKey, {
      data: categories,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Clear all cached data (called when categories are modified)
   */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Get current cache stats for debugging
   */
  getStats(): { size: number; ttlMs: number; entries: string[] } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Create a consistent cache key from ID array
   */
  private createKey(ids: string[]): string {
    return `ids_${ids.sort().join(",")}`;
  }
}

// Create singleton instance
export const categoriesCache = new CategoriesCache();

/**
 * Log cache operations in development
 */
function logCacheOperation(operation: string, details: string): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[CategoriesCache] ${operation}: ${details}`);
  }
}

export { logCacheOperation };
