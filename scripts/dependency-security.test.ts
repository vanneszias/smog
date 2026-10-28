import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import merge from "deepmerge";

const require = createRequire(import.meta.url);

test("every deepmerge consumer resolves the fixed fork", () => {
  expect(require("deepmerge/package.json").name).toBe("@smog/deepmerge");
  for (const consumer of [
    "@expo/config",
    "html-to-text",
    "jest-config",
    "ultracite/biome/core",
  ]) {
    const fromConsumer = createRequire(require.resolve(consumer));
    expect(fromConsumer("deepmerge/package.json").name).toBe("@smog/deepmerge");
    const result = fromConsumer("deepmerge")(
      {},
      JSON.parse('{"__proto__":{"isAdmin":true},"safe":1}')
    );
    expect(result).toEqual({ safe: 1 });
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
  }
});

test("deepmerge rejects prototype-poisoning keys from either merge input", () => {
  const payload = JSON.parse(
    '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}},"prototype":{"isAdmin":true},"safe":{"value":1}}'
  ) as object;
  for (const result of [
    merge(Object.create(null), payload),
    merge(payload, {}),
    merge({ session: null }, { session: payload }),
  ]) {
    const merged = result as Record<string, unknown>;
    const value = (merged.session ?? merged) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(value.isAdmin).toBeUndefined();
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(Object.hasOwn(value, key)).toBe(false);
    }
    expect(value.safe).toEqual({ value: 1 });
  }
  expect(
    merge({ list: [1], nested: { a: 1 } }, { list: [2], nested: { b: 2 } })
  ).toEqual({
    list: [1, 2],
    nested: { a: 1, b: 2 },
  });
});

test("the fork preserves deepmerge options, symbols, cloning and .all", () => {
  const source = { nested: { value: 1 } };
  expect(merge({}, source).nested).not.toBe(source.nested);
  expect(merge({}, source, { clone: false }).nested).toBe(source.nested);
  expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  expect(
    merge(
      { list: [1] },
      { list: [2] },
      { arrayMerge: (_target, incoming) => incoming }
    )
  ).toEqual({ list: [2] });
  expect(
    merge<{ nested: { a?: number; b?: number } }>(
      { nested: { a: 1 } },
      { nested: { b: 2 } },
      { customMerge: () => (_target, incoming) => incoming }
    )
  ).toEqual({ nested: { b: 2 } });
  const symbol = Symbol("key");
  expect(merge({}, { [symbol]: 1 })[symbol]).toBe(1);
  const date = new Date(0);
  expect(merge({}, { date }).date).toBe(date);
  const instance = new (class Example {})();
  expect(
    merge({}, { instance }, { isMergeableObject: () => false }).instance
  ).toBe(instance);
});
