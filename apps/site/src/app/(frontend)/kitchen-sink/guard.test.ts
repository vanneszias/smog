import { describe, expect, it } from "vitest";
import { isKitchenSinkAvailable } from "./guard";

describe("isKitchenSinkAvailable", () => {
  it("refuses in production, which is what ships", () => {
    expect(isKitchenSinkAvailable("production")).toBe(false);
  });

  it("allows the dev server", () => {
    expect(isKitchenSinkAvailable("development")).toBe(true);
  });

  it("allows the test environment, so a render test is not a 404 test", () => {
    expect(isKitchenSinkAvailable("test")).toBe(true);
  });

  it("allows an unset NODE_ENV rather than failing closed on a bare script", () => {
    expect(isKitchenSinkAvailable(undefined)).toBe(true);
  });

  /*
   * `NODE_ENV=Production` is not production to Node, to Next or to anything
   * else that reads it, and a guard that folded case here would be the only
   * component of the system with that opinion. Pinned so the next person to
   * "harden" this sees that the looseness is deliberate.
   */
  it("treats a differently-cased value as not production, as Node does", () => {
    expect(isKitchenSinkAvailable("Production")).toBe(true);
  });
});
