/**
 * The strings table at full size (phase 10b task 4 acceptance: "stays
 * usable at 1,800+ rows"): every key of every language stored as an
 * override, then a page, a filter, the coverage and a full export each
 * within a budget. The screen pages the table (100 rows per page), so the
 * cost of a page is what the user waits for.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { StringsPage } from "../../../../features/translation/src/schema/index";
import {
  catalogueKeys,
  isApplicable,
  sourceHash,
  sourceOf,
} from "../../../../features/translation/src/server/model";
import { type Authed, callAs, resetTranslationData, signedUp } from "./helpers";

/** Generous for a loaded CI runner; the measured time is a fraction of it. */
const BUDGET_MS = 3000;

let translator: Authed;

async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await run();
  return [result, performance.now() - start];
}

beforeAll(async () => {
  translator = await signedUp("translator");
  await resetTranslationData();
  const keys = catalogueKeys(["nl", "en", "fr"]);
  const rows = ["nl", "en", "fr"].flatMap((locale) =>
    keys
      .filter((info) => isApplicable(info, locale))
      .map((info) => {
        const source = sourceOf(new Map(), "nl", info);
        return {
          h: locale === "nl" ? null : sourceHash(source),
          k: info.key,
          l: locale,
          v: locale === "nl" ? source : `${locale}: ${source}`,
        };
      })
  );
  expect(rows.length).toBeGreaterThan(5400);
  const insert = env.DB.prepare(
    "INSERT OR REPLACE INTO ui_string (locale, key, value, source_hash, updated_at) SELECT json_extract(j.value, '$.l'), json_extract(j.value, '$.k'), json_extract(j.value, '$.v'), json_extract(j.value, '$.h'), 1 FROM json_each(?) AS j"
  );
  const chunks: D1PreparedStatement[] = [];
  for (let start = 0; start < rows.length; start += 500) {
    chunks.push(insert.bind(JSON.stringify(rows.slice(start, start + 500))));
  }
  await env.DB.batch(chunks);
}, 60_000);

describe("a catalogue with every string stored in every language", () => {
  it("pages and filters within the budget", async () => {
    const [page, pageMs] = await timed(() =>
      callAs<StringsPage>(translator, "strings.list", { limit: 100 })
    );
    expect(page.total).toBeGreaterThan(1700);
    expect(page.items).toHaveLength(100);
    expect(pageMs).toBeLessThan(BUDGET_MS);
    const [search, searchMs] = await timed(() =>
      callAs<StringsPage>(translator, "strings.list", {
        limit: 100,
        search: "aanmelden",
      })
    );
    expect(search.total).toBeGreaterThan(0);
    expect(searchMs).toBeLessThan(BUDGET_MS);
    const [stale, staleMs] = await timed(() =>
      callAs<StringsPage>(translator, "strings.list", {
        limit: 100,
        locale: "fr",
        status: "stale",
      })
    );
    expect(stale.total).toBe(0);
    expect(staleMs).toBeLessThan(BUDGET_MS);
  });

  it("computes the coverage and exports a language within the budget", async () => {
    const [coverage, coverageMs] = await timed(() =>
      callAs<{ languages: { translated: number; total: number }[] }>(
        translator,
        "coverage"
      )
    );
    expect(
      coverage.languages.every((row) => row.translated === row.total)
    ).toBe(true);
    expect(coverageMs).toBeLessThan(BUDGET_MS);
    const [file, exportMs] = await timed(() =>
      callAs<{ rows: number }>(translator, "strings.export", {
        format: "csv",
      })
    );
    expect(file.rows).toBeGreaterThan(5000);
    expect(exportMs).toBeLessThan(BUDGET_MS);
  });

  it("applies a whole-catalogue import in one batch", async () => {
    const [file] = await timed(() =>
      callAs<{ content: string }>(translator, "strings.export", {
        format: "json",
      })
    );
    const edited = JSON.parse(file.content) as Record<
      string,
      Record<string, string>
    >;
    const en = edited.en as Record<string, string>;
    for (const key of Object.keys(en)) {
      en[key] = `${en[key]} !`;
    }
    const [result, ms] = await timed(() =>
      callAs<{ applied: number }>(translator, "strings.import", {
        content: JSON.stringify(edited),
        format: "json",
      })
    );
    expect(result.applied).toBeGreaterThan(1700);
    expect(ms).toBeLessThan(BUDGET_MS * 3);
  });
});
