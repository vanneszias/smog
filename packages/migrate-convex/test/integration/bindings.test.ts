import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * The integration suite's ground (task 10 builds on it): every migration
 * is applied to `DB`, through 0012 (`user.welcomed_at`, which the importer
 * sets so a migrated user is never welcomed), and `KV` is there for
 * `catalog:version`.
 */
describe("the integration bindings", () => {
  it("has a D1 with every migration, including 0012", async () => {
    const applied = await env.DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id"
    ).all<{ name: string }>();
    expect(applied.results.map((row) => row.name)).toEqual(
      env.TEST_MIGRATIONS.map((migration) => migration.name)
    );
    expect(applied.results.map((row) => row.name)).toContain(
      "0012_user_welcomed_at.sql"
    );
    const column = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('user') WHERE name = 'welcomed_at'"
    ).first();
    expect(column).toEqual({ name: "welcomed_at" });
  });

  it("has a KV", async () => {
    await env.KV.put("catalog:version", "test");
    expect(await env.KV.get("catalog:version")).toBe("test");
  });
});
