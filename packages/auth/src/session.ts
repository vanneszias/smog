import type { Auth } from "./server";

export type Role = "user" | "admin";

export type SessionWithUser = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>;
export type SessionUser = SessionWithUser["user"];

/** The current session for request headers (cookie or bearer), or null. */
export async function getSession(
  auth: Auth,
  headers: Headers
): Promise<SessionWithUser | null> {
  try {
    return await auth.api.getSession({ headers });
  } catch (error) {
    console.error("[auth] Failed to read the session:", error);
    throw error;
  }
}

export class AuthError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN") {
    super(code);
    this.code = code;
    this.name = "AuthError";
  }
}

/** The signed-in user, or an `UNAUTHORIZED` AuthError. */
export function requireUser(session: SessionWithUser | null): SessionUser {
  if (!session) {
    throw new AuthError("UNAUTHORIZED");
  }
  return session.user;
}

/** The signed-in admin, or an `UNAUTHORIZED` / `FORBIDDEN` AuthError. */
export function requireAdminUser(session: SessionWithUser | null): SessionUser {
  const current = requireUser(session);
  if (current.role !== "admin") {
    throw new AuthError("FORBIDDEN");
  }
  return current;
}
