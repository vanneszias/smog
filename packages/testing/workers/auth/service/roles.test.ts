import { userRole } from "@smog/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasRole, normalizeRoles } from "../../../../auth/src/fields";
import {
  getSession,
  requireAdminUser,
  requireRoleUser,
  requireUser,
} from "../../../../auth/src/session";
import { makeUser } from "../../../support/db/index";
import { codeIn, cookieHeader, setup, uniqueEmail } from "./helpers";

async function signedIn(ctx: ReturnType<typeof setup>, role: "user" | "admin") {
  const email = uniqueEmail();
  const member = await makeUser(ctx.db, { email, emailVerified: true, role });
  await ctx.call("/email-otp/send-verification-otp", {
    body: { email, type: "sign-in" },
  });
  const otp = codeIn(ctx.email.sent.at(-1)?.text);
  const response = await ctx.call("/sign-in/email-otp", {
    body: { email, otp },
  });
  return { headers: new Headers({ cookie: cookieHeader(response) }), member };
}

describe("roles as a set (phase 10b task 2)", () => {
  it("hasRole: admin implies every role, others need a match", () => {
    expect(hasRole(["admin"], "translator")).toBe(true);
    expect(hasRole(["teacher"], "translator")).toBe(false);
    expect(hasRole(["teacher", "translator"], "translator")).toBe(true);
    expect(hasRole([], "translator")).toBe(false);
    expect(hasRole(undefined, "admin")).toBe(false);
    expect(normalizeRoles(["teacher", "bogus", "admin", "teacher"])).toEqual([
      "teacher",
      "admin",
    ]);
  });

  it("the session carries the roles held in D1, read per request", async () => {
    const ctx = setup();
    const { headers, member } = await signedIn(ctx, "user");
    expect((await getSession(ctx.auth, headers))?.user.roles).toEqual([]);

    await ctx.db.insert(userRole).values([
      { role: "teacher", userId: member.id },
      { role: "translator", userId: member.id },
    ]);
    expect((await getSession(ctx.auth, headers))?.user.roles).toEqual([
      "translator",
      "teacher",
    ]);

    await ctx.db
      .delete(userRole)
      .where(and(eq(userRole.userId, member.id), eq(userRole.role, "teacher")));
    expect((await getSession(ctx.auth, headers))?.user.roles).toEqual([
      "translator",
    ]);
  });

  it("an admin (user.role) has the admin role, also over HTTP", async () => {
    const ctx = setup();
    const { headers } = await signedIn(ctx, "admin");
    const session = await getSession(ctx.auth, headers);
    expect(session?.user.roles).toEqual(["admin"]);
    const http = await ctx.call("/get-session", {
      cookie: headers.get("cookie") ?? "",
    });
    const body = (await http.json()) as { user: { roles: string[] } };
    expect(body.user.roles).toEqual(["admin"]);
  });

  it("requireRoleUser: guest UNAUTHORIZED, wrong role FORBIDDEN, admin passes", async () => {
    const ctx = setup();
    const learner = await signedIn(ctx, "user");
    const translator = await signedIn(ctx, "user");
    await ctx.db
      .insert(userRole)
      .values({ role: "translator", userId: translator.member.id });
    const admin = await signedIn(ctx, "admin");
    const learnerSession = await getSession(ctx.auth, learner.headers);
    const translatorSession = await getSession(ctx.auth, translator.headers);
    const adminSession = await getSession(ctx.auth, admin.headers);

    expect(() => requireRoleUser(null, "translator")).toThrow("UNAUTHORIZED");
    expect(() => requireRoleUser(learnerSession, "translator")).toThrow(
      "FORBIDDEN"
    );
    expect(requireRoleUser(translatorSession, "translator").id).toBe(
      translator.member.id
    );
    expect(() => requireRoleUser(translatorSession, "teacher")).toThrow(
      "FORBIDDEN"
    );
    expect(requireRoleUser(adminSession, "teacher").id).toBe(admin.member.id);
    expect(() => requireAdminUser(translatorSession)).toThrow("FORBIDDEN");
    expect(requireUser(translatorSession).id).toBe(translator.member.id);
  });
});
