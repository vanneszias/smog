import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context";

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
