import { ORPCError } from "@orpc/server";
import { api } from "@smog/convex";
import type { Doc, Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { convexClient } from "../lib/convex";

type Gesture = Doc<"gestures">;
type Category = Doc<"categories">;

async function getCurrentUserId(workosId: string) {
  const user = await convexClient.query(api.users.getUserByWorkOSId, {
    workosId,
  });

  if (!user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "User is not synced to Convex",
    });
  }

  return user._id;
}

async function enrichGestures(gestures: Gesture[]) {
  const categoryIds = [
    ...new Set(gestures.flatMap((gesture) => gesture.categoryIds)),
  ];

  const categories = await convexClient.query(api.categories.getByIds, {
    ids: categoryIds,
  });

  const categoryMap = new Map(
    categories.map((category: Category) => [category._id, category])
  );

  return gestures.map((gesture) => ({
    ...gesture,
    categories: gesture.categoryIds
      .map((id) => categoryMap.get(id))
      .filter(Boolean),
  }));
}

export const listsRouter = {
  initialize: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.mutation(api.lists.initializeUserLists, {
      userId,
    });
  }),

  getMyLists: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.query(api.lists.listUserLists, { userId });
  }),

  getSavedGestureIds: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.query(api.lists.getSavedGestureIds, { userId });
  }),

  getGestureListIds: protectedProcedure
    .input(z.object({ gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.query(api.lists.getGestureListIds, {
        userId,
        gestureId: input.gestureId as Id<"gestures">,
      });
    }),

  getListGestures: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      const gestures = await convexClient.query(api.lists.getListGestures, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
      });

      return await enrichGestures(gestures);
    }),

  getSharedList: publicProcedure
    .input(z.object({ shareToken: z.string() }))
    .handler(
      async ({ input }) =>
        await convexClient.query(api.lists.getSharedList, {
          shareToken: input.shareToken,
        })
    ),

  getSharedListGestures: publicProcedure
    .input(z.object({ shareToken: z.string() }))
    .handler(async ({ input }) => {
      const gestures = await convexClient.query(
        api.lists.getSharedListGestures,
        {
          shareToken: input.shareToken,
        }
      );

      return await enrichGestures(gestures);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(280).optional(),
        visibility: z.enum(["private", "shared"]),
        allowSharedEditing: z.boolean(),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.createList, {
        userId,
        ...input,
      });
    }),

  rename: protectedProcedure
    .input(z.object({ listId: z.string(), name: z.string().min(1).max(80) }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.renameList, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
        name: input.name,
      });
    }),

  updateSharing: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        visibility: z.enum(["private", "shared"]),
        allowSharedEditing: z.boolean(),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.updateListSharing, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
        visibility: input.visibility,
        allowSharedEditing: input.allowSharedEditing,
      });
    }),

  regenerateShareTokens: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.regenerateShareTokens, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.deleteList, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
      });
    }),

  addGestureToList: protectedProcedure
    .input(z.object({ listId: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.addGestureToList, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
        gestureId: input.gestureId as Id<"gestures">,
      });
    }),

  removeGestureFromList: protectedProcedure
    .input(z.object({ listId: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.removeGestureFromList, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
        gestureId: input.gestureId as Id<"gestures">,
      });
    }),

  addGestureToEditableSharedList: protectedProcedure
    .input(z.object({ editShareToken: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.addGestureToSharedEditableList,
        {
          userId,
          editShareToken: input.editShareToken,
          gestureId: input.gestureId as Id<"gestures">,
        }
      );
    }),

  removeGestureFromEditableSharedList: protectedProcedure
    .input(z.object({ editShareToken: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.removeGestureFromSharedEditableList,
        {
          userId,
          editShareToken: input.editShareToken,
          gestureId: input.gestureId as Id<"gestures">,
        }
      );
    }),

  reorderItems: protectedProcedure
    .input(z.object({ listId: z.string(), gestureIds: z.array(z.string()) }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(api.lists.reorderListItems, {
        userId,
        listId: input.listId as Id<"gesture_lists">,
        gestureIds: input.gestureIds as Id<"gestures">[],
      });
    }),
};
