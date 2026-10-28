import { describe, expect, test } from "bun:test";
import {
  tokenPageHead,
  tokenPageHeaders,
} from "../../../../../../apps/site/src/lib/token-page";

describe("the token pages send no Referer (phase 9 ruling 7)", () => {
  test("the response header", () => {
    expect(tokenPageHeaders()).toEqual({ "referrer-policy": "no-referrer" });
  });

  test("the meta tag, for a client navigation", () => {
    const head = tokenPageHead({ meta: [{ title: "x" }] });
    expect(head.meta).toContainEqual({
      content: "no-referrer",
      name: "referrer",
    });
    expect(head.meta).toContainEqual({ title: "x" });
  });
});
