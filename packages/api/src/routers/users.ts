import { api } from "@smog/convex";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { convexClient, withServiceAuth } from "../lib/convex";

export const usersRouter = {
  // Get or create Convex user by WorkOS ID
  getOrCreateUser: protectedProcedure.handler(async ({ context }) => {
    const { workosId } = context;

    // Try to find existing user
    const existingUser = await convexClient.query(
      api.users.getUserByWorkOSId,
      withServiceAuth({ workosId })
    );

    if (existingUser) {
      // Update last active time
      await convexClient.mutation(
        api.users.updateLastActive,
        withServiceAuth({ userId: existingUser._id })
      );
      return existingUser;
    }

    await convexClient.mutation(
      api.users.createUser,
      withServiceAuth({ workosId })
    );

    return await convexClient.query(
      api.users.getUserByWorkOSId,
      withServiceAuth({ workosId })
    );
  }),

  // Get user by WorkOS ID
  getByWorkOSId: protectedProcedure
    .input(z.object({ workosId: z.string() }))
    .handler(async ({ input, context }) => {
      if (input.workosId !== context.workosId) {
        return null;
      }
      const user = await convexClient.query(
        api.users.getUserByWorkOSId,
        withServiceAuth({ workosId: input.workosId })
      );
      return user;
    }),
};
