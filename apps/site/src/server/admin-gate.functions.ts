import { AuthError, requireRoleUser } from "@smog/auth";
import { type AuthUser, toAuthState } from "@smog/auth/react";
import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { safeRedirect } from "../lib/redirect";
import { requestSession } from "./session";

const ADMIN_HOME = "/admin";

/** Where sign-in returns to: the admin page asked for, else `/admin`. */
function adminReturnPath(value: unknown): string {
  const path = safeRedirect(value);
  return path === ADMIN_HOME ||
    path.startsWith(`${ADMIN_HOME}/`) ||
    path.startsWith(`${ADMIN_HOME}?`)
    ? path
    : ADMIN_HOME;
}

export interface AdminGate {
  user: AuthUser;
}

/**
 * The admin gate (ruling 10), run in `/admin`'s `beforeLoad` on every admin
 * navigation. The session is read from D1 for this request, so a demotion
 * applies on the next navigation:
 * - a guest is redirected to `/sign-in?redirect=<the admin path>`;
 * - a signed-in account with none of the admin, translator and teacher roles
 *   gets the 404 page (the admin surface is not disclosed);
 * - an admin, a translator or a teacher gets `{ user }`; the layout then
 *   narrows a translator to the translation screens and the teacher
 *   information and a teacher to the lessons and the teacher information
 *   (`lib/admin-access.ts`).
 * The procedures check the role again (`requireAdmin`, `requireRole`); this
 * only decides what the page shows.
 */
export const getAdminGate = createServerFn()
  .validator((href: unknown): string => adminReturnPath(href))
  .handler(async ({ data: returnPath }): Promise<AdminGate> => {
    const session = await requestSession(getRequest());
    try {
      // `admin` implies every other role: a translator, a teacher or an admin.
      requireRoleUser(session, "translator", "teacher");
    } catch (error) {
      if (error instanceof AuthError && error.code === "UNAUTHORIZED") {
        throw redirect({ search: { redirect: returnPath }, to: "/sign-in" });
      }
      if (error instanceof AuthError) {
        throw notFound();
      }
      console.error("[admin] Failed to check the admin gate:", error);
      throw error;
    }
    const { user } = toAuthState({ data: session, isPending: false });
    if (!user) {
      throw notFound();
    }
    return { user };
  });
