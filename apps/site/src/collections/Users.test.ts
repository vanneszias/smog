import { describe, expect, it } from "vitest";
import {
  isAdmin,
  isAdminOrSelf,
  isAdminOrSelfRegistration,
  SELF_REGISTRATION,
} from "@/access";
import { googleStrategy } from "@/auth/googleStrategy";
import { usersCollectionEndpoints } from "@/endpoints/auth";
import { cascadeListsOnUserDelete } from "@/hooks/cascadeListsOnUserDelete";
import {
  enforcePasswordPolicy,
  enforcePasswordPolicyOnReset,
} from "@/hooks/enforcePasswordPolicy";
import { Users } from "./Users";

const field = (name: string) =>
  Users.fields.find((f) => "name" in f && f.name === name);

describe("Users collection", () => {
  it("uses the users slug", () => {
    expect(Users.slug).toBe("users");
  });

  it("wires read and update through isAdminOrSelf, not a raw boolean", () => {
    // Reference equality: swapping this for `isAdmin` would lock users out
    // of their own record, and swapping it for `() => true` would let any
    // signed-in user read or update anyone else's. Behavior is covered
    // end-to-end in Users.int.test.ts.
    expect(Users.access?.read).toBe(isAdminOrSelf);
    expect(Users.access?.update).toBe(isAdminOrSelf);
  });

  it("wires delete through isAdmin", () => {
    expect(Users.access?.delete).toBe(isAdmin);
  });

  it("cascades the owner's lists on delete", () => {
    // The behaviour lives in `Lists.delete.int.test.ts`, which deletes a real
    // user who owns real lists. This pins that the hook is still wired up —
    // unwiring it does not fail any config-shaped assertion, it just returns
    // the raw `Failed query: delete from "users" ...` to whoever next deletes
    // an account. The whole array, so a second hook is a deliberate change.
    expect(Users.hooks?.beforeDelete).toEqual([cascadeListsOnUserDelete]);
  });

  it("locks an account after five failed sign-ins, for ten minutes", () => {
    // These two are the brute-force control, and they are the control
    // because the KDF is not: 25,000 PBKDF2 iterations against OWASP's
    // 600,000, on a Payload version pinned by workerd's own cap. The
    // reasoning is in the header of `Users.ts`.
    //
    // They are pinned here even though 3.89.0's `addDefaultsToAuthConfig`
    // already supplies exactly these values for a bare `auth: true`. That
    // is the reason to pin them, not a reason to skip it: an upstream
    // default can move under a dependency bump without anything in this
    // repository changing, and nothing else in the suite would notice.
    // `lockTime` is milliseconds.
    expect(Users.auth).toMatchObject({
      maxLoginAttempts: 5,
      lockTime: 600_000,
    });
  });

  it("enforces a password policy on write", () => {
    // Payload's own floor is a hard-coded three characters, so without this
    // hook `abc` is a valid password. The whole array, so adding a second
    // beforeValidate hook is a deliberate change. Behaviour is covered in
    // `Users.password.int.test.ts`.
    expect(Users.hooks?.beforeValidate).toEqual([enforcePasswordPolicy]);
  });

  /**
   * Public REST registration is closed. The behavioural half is in
   * `Users.rest.int.test.ts`, which drives the mounted REST API; this pins the
   * wiring, because a `create` that quietly went back to `() => true` would
   * fail nothing else in this file.
   */
  it("no longer lets anybody create a user over the public API", () => {
    expect(Users.access?.create).toBe(isAdminOrSelfRegistration);
    expect(Users.access?.create?.({ req: {} } as never)).toBe(false);
    expect(
      Users.access?.create?.({ req: { user: { role: "user" } } } as never)
    ).toBe(false);
  });

  it("still lets an admin and the site's own sign-up create one", () => {
    expect(
      Users.access?.create?.({ req: { user: { role: "admin" } } } as never)
    ).toBe(true);
    expect(
      Users.access?.create?.({
        req: { context: { [SELF_REGISTRATION]: true } },
      } as never)
    ).toBe(true);
  });

  /**
   * The custom strategy is on the path of every authenticated request,
   * including the admin panel's, because `payload.init` puts a collection's
   * own strategies *before* `local-jwt`. The whole array, so a second
   * strategy is a deliberate change rather than something that appears.
   */
  it("registers the Google auth strategy, and only that one", () => {
    expect(Users.auth).toMatchObject({ strategies: [googleStrategy] });
    expect(googleStrategy.name).toBe("google");
  });

  /**
   * Shadowing Payload's built-in `POST /api/users/login` is what closes the
   * `LockedAuth` leak on the mounted REST API. `sanitize.js` appends the
   * built-ins *after* whatever the collection declares and `handleEndpoints`
   * takes the first match, so the path and method have to be exactly these.
   */
  it("shadows the built-in login endpoint", () => {
    expect(Users.endpoints).toBe(usersCollectionEndpoints);
    expect(usersCollectionEndpoints).toHaveLength(1);
    expect(usersCollectionEndpoints[0]).toMatchObject({
      method: "post",
      path: "/login",
    });
  });

  /**
   * Without these, `isAdminOrSelf` lets a signed-in visitor write somebody
   * else's provider subject onto their own account — and the next time that
   * person signs in with Google they land in the attacker's account.
   */
  it("lets only an admin write a linked social identity", () => {
    const accounts = field("oauthAccounts") as {
      access?: {
        create?: (args: never) => boolean;
        update?: (args: never) => boolean;
      };
    };

    for (const guard of [accounts.access?.create, accounts.access?.update]) {
      expect(guard?.({ req: { user: { role: "user" } } } as never)).toBe(false);
      expect(guard?.({ req: { user: { role: "admin" } } } as never)).toBe(true);
    }
  });

  /**
   * The same guard as `oauthAccounts`, on the three fields that carry a
   * pending address change. Without them a signed-in visitor can write their
   * own `pendingEmailToken` over REST and then confirm their own change,
   * which is a verification step performed by one person on both ends.
   * Behaviour is in `Users.escalation.int.test.ts`.
   */
  it("lets only an admin write a pending address change", () => {
    for (const name of [
      "pendingEmail",
      "pendingEmailToken",
      "pendingEmailExpiresAt",
    ]) {
      const pending = field(name) as {
        access?: {
          create?: (args: never) => boolean;
          update?: (args: never) => boolean;
        };
      };

      for (const guard of [pending.access?.create, pending.access?.update]) {
        expect(
          guard?.({ req: { user: { role: "user" } } } as never),
          name
        ).toBe(false);
        expect(
          guard?.({ req: { user: { role: "admin" } } } as never),
          name
        ).toBe(true);
      }
    }
  });

  it("keeps the confirmation token out of every API response", () => {
    expect(field("pendingEmailToken")).toMatchObject({ hidden: true });
  });

  it("applies the password policy to a reset, where beforeValidate cannot", () => {
    /*
     * `resetPassword` hashes before it validates and hands `beforeValidate`
     * the user document, so the floor has to be applied from
     * `beforeOperation` instead. The whole array, so adding a second
     * `beforeOperation` hook is a deliberate change. Behaviour is in
     * `Users.password.int.test.ts`.
     */
    expect(Users.hooks?.beforeOperation).toEqual([
      enforcePasswordPolicyOnReset,
    ]);
  });

  it("adds a role field defaulting to user", () => {
    expect(field("role")).toMatchObject({
      type: "select",
      required: true,
      defaultValue: "user",
    });
  });

  it("guards role updates with a field-level access check, since document-level isAdminOrSelf alone would let a user PATCH their own role to admin", () => {
    const role = field("role") as { access?: { update?: unknown } };
    expect(typeof role.access?.update).toBe("function");
  });

  it("denies a non-admin field-level update on role", () => {
    const role = field("role") as {
      access?: { update?: (args: never) => boolean };
    };
    expect(
      role.access?.update?.({ req: { user: { role: "user" } } } as never)
    ).toBe(false);
  });

  it("allows an admin field-level update on role", () => {
    const role = field("role") as {
      access?: { update?: (args: never) => boolean };
    };
    expect(
      role.access?.update?.({ req: { user: { role: "admin" } } } as never)
    ).toBe(true);
  });
});
