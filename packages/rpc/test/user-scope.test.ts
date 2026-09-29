import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isOtherUsersKey, purgeOtherUsers, userScopedKey } from "../src/react";

describe("userScopedKey", () => {
  it("appends the user scope (null for no user) to the oRPC key", () => {
    const key = [["lists", "mine"], { type: "query" }] as const;
    expect(userScopedKey(key, "user-1")).toEqual([
      ["lists", "mine"],
      { type: "query" },
      { user: "user-1" },
    ]);
    expect(userScopedKey(key, undefined).at(-1)).toEqual({ user: null });
  });
});

describe("isOtherUsersKey", () => {
  it("is true only for a key scoped to another user", () => {
    const key = userScopedKey(["lists"], "user-1");
    expect(isOtherUsersKey(key, "user-2")).toBe(true);
    expect(isOtherUsersKey(key, undefined)).toBe(true);
    expect(isOtherUsersKey(key, "user-1")).toBe(false);
    expect(isOtherUsersKey(userScopedKey(["lists"], undefined), "u")).toBe(
      false
    );
    expect(isOtherUsersKey(["gestures", { type: "query" }], "u")).toBe(false);
  });
});

describe("purgeOtherUsers", () => {
  it("removes every feature's queries scoped to another user", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(userScopedKey(["lists"], "user-1"), 1);
    queryClient.setQueryData(userScopedKey(["favorites"], "user-1"), 2);
    queryClient.setQueryData(userScopedKey(["favorites"], "user-2"), 3);
    queryClient.setQueryData(["gestures", "list"], 4);

    purgeOtherUsers(queryClient, "user-2");

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toEqual([
      userScopedKey(["favorites"], "user-2"),
      ["gestures", "list"],
    ]);

    purgeOtherUsers(queryClient, undefined);
    expect(queryClient.getQueryData(["gestures", "list"])).toBe(4);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});
