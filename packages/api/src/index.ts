import { ORPCError, os } from "@orpc/server";
import { api } from "@smog/convex";
import type { Context } from "./context";
import { convexClient } from "./lib/convex";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.workosId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      workosId: context.workosId,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.workosId) {
    throw new ORPCError("UNAUTHORIZED");
  }

  // Query Convex to get user role
  const user = await convexClient.query(api.users.getUserByWorkOSId, {
    workosId: context.workosId,
  });

  if (!user || user.role !== "admin") {
    throw new ORPCError("FORBIDDEN", {
      message: "Admin access required",
    });
  }

  return next({
    context: {
      workosId: context.workosId,
      userId: user._id,
    },
  });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
