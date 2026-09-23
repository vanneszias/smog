import { describe, expect, it } from "vitest";
import { seedUsersFromEnv } from "./seed";

describe("seedUsersFromEnv", () => {
  it("produces exactly one admin and one regular user", () => {
    const users = seedUsersFromEnv({});

    expect(users.map((user) => user.role)).toEqual(["admin", "user"]);
  });

  it("falls back to local defaults when nothing is configured", () => {
    const [admin, user] = seedUsersFromEnv({});

    expect(admin.email).toBeTruthy();
    expect(admin.password).toBeTruthy();
    expect(user.email).toBeTruthy();
    expect(user.password).toBeTruthy();
    expect(admin.email).not.toBe(user.email);
  });

  it("takes the emails and passwords from the environment when they are set", () => {
    const [admin, user] = seedUsersFromEnv({
      SEED_ADMIN_EMAIL: "boss@example.test",
      SEED_ADMIN_PASSWORD: "boss-password",
      SEED_USER_EMAIL: "member@example.test",
      SEED_USER_PASSWORD: "member-password",
    });

    expect(admin).toEqual({
      email: "boss@example.test",
      password: "boss-password",
      role: "admin",
    });
    expect(user).toEqual({
      email: "member@example.test",
      password: "member-password",
      role: "user",
    });
  });

  // An empty or whitespace-only variable is a misconfiguration, not a
  // request for an account with a blank password — Payload would reject the
  // create and the seed would die halfway through.
  it("treats a blank or whitespace-only variable as unset", () => {
    const [admin] = seedUsersFromEnv({
      SEED_ADMIN_EMAIL: "   ",
      SEED_ADMIN_PASSWORD: "",
    });
    const [fallback] = seedUsersFromEnv({});

    expect(admin).toEqual(fallback);
  });
});
