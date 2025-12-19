import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { publicProcedure } from "../index";
import { convexClient } from "../lib/convex";

export const categoriesRouter = {
  list: publicProcedure.handler(async () => {
    const categories = await convexClient.query(api.categories.list);
    return categories;
  }),

  getByIds: publicProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      })
    )
    .handler(async ({ input }) => {
      const categories = await convexClient.query(api.categories.getByIds, {
        ids: input.ids as Id<"categories">[],
      });
      return categories;
    }),
};
