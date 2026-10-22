import { ORPCError, os } from "@orpc/server";
import {
  AuthError,
  requireAdminUser,
  requireRoleUser,
  requireUser as requireSessionUser,
  type SessionUser,
  type SessionWithUser,
  type UserRole,
} from "@smog/auth";
import { ERRORS } from "../errors";

type Guard = (session: SessionWithUser | null) => SessionUser;

function guardUser(guard: Guard, session: SessionWithUser | null): SessionUser {
  try {
    return guard(session);
  } catch (error) {
    if (error instanceof AuthError) {
      throw new ORPCError(error.code, {
        cause: error,
        status: ERRORS[error.code].status,
      });
    }
    throw error;
  }
}

const withSession = os.$context<{ session: SessionWithUser | null }>();

/** Adds the signed-in `user` to the context, or throws `UNAUTHORIZED`. */
export const requireUser = withSession.middleware(
  async ({ context, next }) =>
    await next({
      context: { user: guardUser(requireSessionUser, context.session) },
    })
);

/** Adds the signed-in admin as `user`, or throws `UNAUTHORIZED` / `FORBIDDEN`. */
export const requireAdmin = withSession.middleware(
  async ({ context, next }) =>
    await next({
      context: { user: guardUser(requireAdminUser, context.session) },
    })
);

/**
 * Adds the signed-in user as `user` when they hold one of `roles` (`admin`
 * passes every check), or throws `UNAUTHORIZED` / `FORBIDDEN`. Roles are
 * read from D1 on every request, so a demotion applies at once.
 */
export function requireRole(...roles: readonly UserRole[]) {
  return withSession.middleware(
    async ({ context, next }) =>
      await next({
        context: {
          user: guardUser(
            (session) => requireRoleUser(session, ...roles),
            context.session
          ),
        },
      })
  );
}
