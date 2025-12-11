import type { ConvexReactClient } from "convex/react";
import type { Gesture } from "@/types";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";

class ConvexService {
  private client: ConvexReactClient | null = null;
  private isInitialized = false;

  async initialize(client: ConvexReactClient): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.client = client;
    this.isInitialized = true;

    if (__DEV__) {
      console.log("[convexService] Convex client initialized");
    }
  }

  private ensureInitialized(): void {
    if (!(this.client && this.isInitialized)) {
      throw new Error(
        "ConvexService not initialized. Call initialize() first."
      );
    }
  }

  async getAllGestures(): Promise<
    Array<{ gesture: Gesture; convexId: string; lastUpdated: number }>
  > {
    this.ensureInitialized();

    // Get first page of gestures
    const result = await this.client?.query(api.gestures.list, {
      paginationOpts: { numItems: 1000, cursor: null },
    });

    // Resolve categories for all gestures
    const gesturesWithCategories = await Promise.all(
      result.page.map(async (doc) => {
        const categoryNames = await this.resolveCategoryNames(doc.categoryIds);
        return {
          gesture: {
            id: doc._id, // Use Convex ID as local ID for now
            name: doc.name,
            category: categoryNames,
            playbackId: doc.playbackId,
            concept: doc.concept,
            info: doc.info,
          },
          convexId: doc._id,
          lastUpdated: doc.lastUpdated,
        };
      })
    );

    return gesturesWithCategories;
  }

  async getAllCategories(): Promise<
    Array<{ id: string; name: string; convexId: string }>
  > {
    this.ensureInitialized();

    const categories = await this.client?.query(api.categories.list, {});

    return categories.map((doc) => ({
      id: doc._id,
      name: doc.name,
      convexId: doc._id,
    }));
  }

  async resolveCategoryNames(
    categoryIds: Id<"categories">[]
  ): Promise<string[]> {
    this.ensureInitialized();

    if (categoryIds.length === 0) {
      return [];
    }

    const categories = await this.client?.query(api.categories.getByIds, {
      ids: categoryIds,
    });

    return categories.map((cat) => cat.name);
  }

  async getLastUpdated(): Promise<number | null> {
    this.ensureInitialized();

    return await this.client?.query(api.gestures.getLastUpdated, {});
  }

  async searchGestures(
    searchText: string,
    limit?: number
  ): Promise<Array<{ gesture: Gesture; convexId: string }>> {
    this.ensureInitialized();

    const results = await this.client?.query(api.gestures.search, {
      searchText,
      limit,
    });

    // Resolve categories for all gestures
    const gesturesWithCategories = await Promise.all(
      results.map(async (doc) => {
        const categoryNames = await this.resolveCategoryNames(doc.categoryIds);
        return {
          gesture: {
            id: doc._id,
            name: doc.name,
            category: categoryNames,
            playbackId: doc.playbackId,
            concept: doc.concept,
            info: doc.info,
          },
          convexId: doc._id,
        };
      })
    );

    return gesturesWithCategories;
  }

  async getGestureById(
    convexId: Id<"gestures">
  ): Promise<{ gesture: Gesture; convexId: string } | null> {
    this.ensureInitialized();

    const doc = await this.client?.query(api.gestures.getById, {
      id: convexId,
    });

    if (!doc) {
      return null;
    }

    const categoryNames = await this.resolveCategoryNames(doc.categoryIds);

    return {
      gesture: {
        id: doc._id,
        name: doc.name,
        category: categoryNames,
        playbackId: doc.playbackId,
        concept: doc.concept,
        info: doc.info,
      },
      convexId: doc._id,
    };
  }

  getClient(): ConvexReactClient {
    this.ensureInitialized();
    return this.client!;
  }
}

export const convexService = new ConvexService();
export default convexService;
