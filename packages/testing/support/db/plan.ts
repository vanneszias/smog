/*
 * Query-plan tests (phase 9 task 6): run the real service code against a D1
 * binding that records every statement, then `EXPLAIN QUERY PLAN` each one
 * with its own bound values. A hot path must seek an index: no bare
 * `SCAN <table>` (a full scan of a large table) unless a test names it.
 */

export interface RecordedStatement {
  params: unknown[];
  sql: string;
}

export interface PlanRow {
  detail: string;
  parent: number;
}

const LIMITED = /\blimit\b/i;
const DERIVED = new Set(["CO-ROUTINE", "MATERIALIZE"]);
const RECORDED = /^\s*(?:select|with|insert|update|delete|replace)\b/i;

/** `d1` wrapped to record each prepared statement and its bound values. */
export function recordingD1(d1: D1Database): {
  d1: D1Database;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const originals = new WeakMap<object, D1PreparedStatement>();
  const wrap = (
    statement: D1PreparedStatement,
    record: RecordedStatement
  ): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, key, receiver) {
        if (key === "bind") {
          return (...params: unknown[]) => {
            record.params = params;
            return wrap(target.bind(...params), record);
          };
        }
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(proxy, statement);
    return proxy;
  };
  const proxy = new Proxy(d1, {
    get(target, key, receiver) {
      if (key === "prepare") {
        return (query: string) => {
          const record: RecordedStatement = { params: [], sql: query };
          statements.push(record);
          return wrap(target.prepare(query), record);
        };
      }
      if (key === "batch") {
        return (items: D1PreparedStatement[]) =>
          target.batch(items.map((item) => originals.get(item) ?? item));
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { d1: proxy, statements };
}

/** The plan of one recorded statement, run on the unwrapped binding. */
export async function explain(
  d1: D1Database,
  statement: RecordedStatement
): Promise<PlanRow[]> {
  const { results } = await d1
    .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .bind(...statement.params)
    .all<PlanRow>();
  return results;
}

/** Reads and writes, not pragmas or DDL. Internal to the scan report. */
function plannable(
  statements: readonly RecordedStatement[]
): RecordedStatement[] {
  return statements.filter((statement) => RECORDED.test(statement.sql));
}

/**
 * Plan rows that read a whole table: `SCAN <table>` (bare, or over a
 * covering index, which still reads every row), but not an ordered scan
 * `SCAN <table> USING INDEX <i>` (it stops at the LIMIT; a keyset first
 * page, only when the statement has a LIMIT: pass `limited: false` for one
 * without), a virtual
 * table (FTS5, `json_each`), a constant row or a materialised subquery.
 */
export function fullScans(
  plan: readonly PlanRow[],
  { limited = true }: { limited?: boolean } = {}
): string[] {
  // A co-routine or a materialised subquery is a few rows already read.
  const derived = new Set(
    plan.flatMap((row) => {
      const [kind, name] = row.detail.split(" ");
      return name && kind && DERIVED.has(kind) ? [name] : [];
    })
  );
  return plan
    .map((row) => row.detail)
    .filter((detail) => {
      if (
        !detail.startsWith("SCAN ") ||
        detail.includes("VIRTUAL TABLE") ||
        detail.startsWith("SCAN CONSTANT") ||
        detail.startsWith("SCAN (") ||
        (limited && detail.includes(" USING INDEX"))
      ) {
        return false;
      }
      const [name = ""] = detail.slice("SCAN ".length).split(" ");
      return !derived.has(name);
    });
}

export interface PlanReport {
  /** The steps of every statement, for a failure message. */
  plans: string[];
  scans: string[];
}

/** Plans every recorded statement and gathers the scans `allowed(detail, sql)` does not name. */
export async function scanReport(
  d1: D1Database,
  statements: readonly RecordedStatement[],
  allowed: (detail: string, sql: string) => boolean = () => false
): Promise<PlanReport> {
  const report: PlanReport = { plans: [], scans: [] };
  for (const statement of plannable(statements)) {
    // biome-ignore lint/performance/noAwaitInLoops: a few plan reads, in order for a readable failure.
    const plan = await explain(d1, statement);
    report.plans.push(
      `${statement.sql.slice(0, 80)}\n  ${plan.map((row) => row.detail).join("\n  ")}`
    );
    const limited = LIMITED.test(statement.sql);
    for (const detail of fullScans(plan, { limited })) {
      if (!allowed(detail, statement.sql)) {
        report.scans.push(`${detail}  <- ${statement.sql.slice(0, 120)}`);
      }
    }
  }
  return report;
}
