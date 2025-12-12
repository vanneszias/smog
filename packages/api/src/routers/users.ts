import { api } from "@smog/convex";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { convexClient } from "../lib/convex";

export const usersRouter = {
  // Get or create Convex user by WorkOS ID
  getOrCreateUser: protectedProcedure.handler(async ({ context }) => {
    const { workosId } = context;

    // Try to find existing user
    const existingUser = await convexClient.query(api.users.getUserByWorkOSId, {
      workosId,
    });

    if (existingUser) {
      // Update last active time
      await convexClient.mutation(api.users.updateLastActive, {
        userId: existingUser._id,
      });
      return existingUser;
    }

    // Create new user
    await convexClient.mutation(api.users.createUser, {
      workosId,
    });

    // Fetch the newly created user
    const newUser = await convexClient.query(api.users.getUserByWorkOSId, {
      workosId,
    });

    return newUser;
  }),

  // Get user by WorkOS ID
  getByWorkOSId: protectedProcedure
    .input(z.object({ workosId: z.string() }))
    .handler(async ({ input }) => {
      const user = await convexClient.query(api.users.getUserByWorkOSId, {
        workosId: input.workosId,
      });
      return user;
    }),
};
