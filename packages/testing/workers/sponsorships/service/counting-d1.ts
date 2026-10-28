/**
 * A D1 binding that counts round trips: each `batch()` and each statement
 * run on its own. Statements handed to `batch` are unwrapped first (D1
 * needs its own objects). The admin dashboard test's helper.
 */
export function countingD1(d1: D1Database) {
  const counter = { roundTrips: 0 };
  const originals = new WeakMap<object, D1PreparedStatement>();
  const RUNS = new Set(["all", "first", "raw", "run"]);
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key === "bind") {
          return (...args: unknown[]) => wrap(target.bind(...args));
        }
        if (typeof key === "string" && RUNS.has(key)) {
          return (...args: unknown[]) => {
            counter.roundTrips += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(proxy, statement);
    return proxy;
  };
  const proxy = new Proxy(d1, {
    get(target, key, receiver) {
      if (key === "prepare") {
        return (query: string) => wrap(target.prepare(query));
      }
      if (key === "batch") {
        return (statements: D1PreparedStatement[]) => {
          counter.roundTrips += 1;
          return target.batch(
            statements.map((statement) => originals.get(statement) ?? statement)
          );
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { counter, d1: proxy };
}
