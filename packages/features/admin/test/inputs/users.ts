import { makeUser } from "@smog/db/testing";
import { testDb } from "../helpers";
import type { ProcedureInputs } from "./index";

/**
 * For each `admin.users` procedure, a function from the fixtures to an
 * input the admin call succeeds with (a mutation then proves it built its
 * audit entry). Task 5 adds its procedures here. Each mutation gets its own
 * plain account, so a promotion never turns a later target into an admin.
 */
export const USERS_INPUTS: ProcedureInputs = {
  "users.ban": async () => ({
    reason: "Spam in shared lists",
    userId: (await makeUser(testDb())).id,
  }),
  "users.delete": async () => {
    const target = await makeUser(testDb());
    return { confirmEmail: target.email, userId: target.id };
  },
  "users.get": (fixtures) => ({ id: fixtures.user.id }),
  "users.list": () => ({}),
  "users.setRole": async () => ({
    role: "admin",
    userId: (await makeUser(testDb())).id,
  }),
  "users.unban": async () => ({
    userId: (await makeUser(testDb(), { banned: true, banReason: "Spam" })).id,
  }),
};
