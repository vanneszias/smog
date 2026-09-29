import { ORPCError } from "@orpc/server";
import { api } from "@smog/convex";
import type { Doc, Id } from "@smog/convex/dataModel";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { convexClient, withServiceAuth } from "../lib/convex";

type Gesture = Doc<"gestures">;
type Category = Doc<"categories">;

async function getCurrentUserId(workosId: string) {
  const user = await convexClient.query(
    api.users.getUserByWorkOSId,
    withServiceAuth({ workosId })
  );

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
  addGestureToEditableSharedList: protectedProcedure
    .input(z.object({ editShareToken: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.addGestureToSharedEditableList,
        {
          editShareToken: input.editShareToken,
          gestureId: input.gestureId as Id<"gestures">,
          userId,
        }
      );
    }),

  addGestureToList: protectedProcedure
    .input(z.object({ gestureId: z.string(), listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.addGestureToList,
        withServiceAuth({
          gestureId: input.gestureId as Id<"gestures">,
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        allowSharedEditing: z.boolean(),
        description: z.string().max(280).optional(),
        name: z.string().min(1).max(80),
        visibility: z.enum(["private", "shared"]),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.createList,
        withServiceAuth({ userId, ...input })
      );
    }),

  delete: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.deleteList,
        withServiceAuth({
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );
    }),

  getGestureListIds: protectedProcedure
    .input(z.object({ gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.query(
        api.lists.getGestureListIds,
        withServiceAuth({
          gestureId: input.gestureId as Id<"gestures">,
          userId,
        })
      );
    }),

  getListGestures: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      const gestures = await convexClient.query(
        api.lists.getListGestures,
        withServiceAuth({
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );

      return await enrichGestures(gestures);
    }),

  getMyLists: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.query(
      api.lists.listUserLists,
      withServiceAuth({ userId })
    );
  }),

  getSavedGestureIds: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.query(
      api.lists.getSavedGestureIds,
      withServiceAuth({ userId })
    );
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
  initialize: protectedProcedure.handler(async ({ context }) => {
    const userId = await getCurrentUserId(context.workosId);
    return await convexClient.mutation(
      api.lists.initializeUserLists,
      withServiceAuth({ userId })
    );
  }),

  regenerateShareTokens: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.regenerateShareTokens,
        withServiceAuth({
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );
    }),

  removeGestureFromEditableSharedList: protectedProcedure
    .input(z.object({ editShareToken: z.string(), gestureId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.removeGestureFromSharedEditableList,
        {
          editShareToken: input.editShareToken,
          gestureId: input.gestureId as Id<"gestures">,
          userId,
        }
      );
    }),

  removeGestureFromList: protectedProcedure
    .input(z.object({ gestureId: z.string(), listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.removeGestureFromList,
        withServiceAuth({
          gestureId: input.gestureId as Id<"gestures">,
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );
    }),

  rename: protectedProcedure
    .input(z.object({ listId: z.string(), name: z.string().min(1).max(80) }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.renameList,
        withServiceAuth({
          listId: input.listId as Id<"gesture_lists">,
          name: input.name,
          userId,
        })
      );
    }),

  reorderItems: protectedProcedure
    .input(z.object({ gestureIds: z.array(z.string()), listId: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.reorderListItems,
        withServiceAuth({
          gestureIds: input.gestureIds as Id<"gestures">[],
          listId: input.listId as Id<"gesture_lists">,
          userId,
        })
      );
    }),

  updateSharing: protectedProcedure
    .input(
      z.object({
        allowSharedEditing: z.boolean(),
        listId: z.string(),
        visibility: z.enum(["private", "shared"]),
      })
    )
    .handler(async ({ context, input }) => {
      const userId = await getCurrentUserId(context.workosId);
      return await convexClient.mutation(
        api.lists.updateListSharing,
        withServiceAuth({
          allowSharedEditing: input.allowSharedEditing,
          listId: input.listId as Id<"gesture_lists">,
          userId,
          visibility: input.visibility,
        })
      );
    }),
};
