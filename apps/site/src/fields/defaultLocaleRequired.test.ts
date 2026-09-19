import type { Validate } from "payload";
import { describe, expect, it } from "vitest";
import { defaultLocaleRequired } from "./defaultLocaleRequired";

const opts = <TValue>(locale?: string): Parameters<Validate<TValue>>[1] =>
  ({ req: { locale } }) as unknown as Parameters<Validate<TValue>>[1];

const MESSAGE = "A Dutch value is required.";

describe("defaultLocaleRequired", () => {
  describe("scalar (single-value) fields", () => {
    const validate = defaultLocaleRequired<string>(MESSAGE);

    it("fails on an empty string in the default locale", () => {
      expect(validate("", opts<string>("nl"))).toBe(MESSAGE);
    });

    it("fails on a whitespace-only string in the default locale", () => {
      expect(validate("   ", opts<string>("nl"))).toBe(MESSAGE);
    });

    it("passes on a non-empty string in the default locale", () => {
      expect(validate("Hallo", opts<string>("nl"))).toBe(true);
    });

    it("passes an empty string in a non-default locale", () => {
      expect(validate("", opts<string>("fr"))).toBe(true);
    });

    it("passes a whitespace-only string in a non-default locale", () => {
      expect(validate("   ", opts<string>("fr"))).toBe(true);
    });

    it("passes a non-empty string in a non-default locale", () => {
      expect(validate("Bonjour", opts<string>("fr"))).toBe(true);
    });

    it("fails on non-string input in the default locale", () => {
      expect(validate(42 as unknown as string, opts<string>("nl"))).toBe(
        MESSAGE
      );
      expect(validate(null as unknown as string, opts<string>("nl"))).toBe(
        MESSAGE
      );
      expect(validate(undefined, opts<string>("nl"))).toBe(MESSAGE);
    });

    it("treats a missing req.locale as the default locale rather than skipping the check", () => {
      expect(validate("", opts<string>(undefined))).toBe(MESSAGE);
      expect(validate("Hallo", opts<string>(undefined))).toBe(true);
    });
  });

  describe("hasMany (array) fields", () => {
    const validate = defaultLocaleRequired<string[]>(MESSAGE);

    it("fails on an empty array in the default locale", () => {
      expect(validate([], opts<string[]>("nl"))).toBe(MESSAGE);
    });

    it("fails on an array of only empty strings in the default locale", () => {
      expect(validate([""], opts<string[]>("nl"))).toBe(MESSAGE);
    });

    it("fails on an array of only whitespace-only strings in the default locale", () => {
      expect(validate(["   "], opts<string[]>("nl"))).toBe(MESSAGE);
    });

    it("passes an array with at least one non-blank string in the default locale", () => {
      expect(validate(["hoi"], opts<string[]>("nl"))).toBe(true);
    });

    it("passes an array mixing blank and non-blank strings in the default locale", () => {
      expect(validate(["", "hoi"], opts<string[]>("nl"))).toBe(true);
    });

    it("passes an empty array in a non-default locale", () => {
      expect(validate([], opts<string[]>("fr"))).toBe(true);
    });

    it("passes an array of only blank strings in a non-default locale", () => {
      expect(validate([""], opts<string[]>("fr"))).toBe(true);
    });
  });
});
