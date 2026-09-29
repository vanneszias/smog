import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/** The seed file has one statement per line (see scripts/seed.ts). */
async function applySeed(): Promise<void> {
  const statements = env.SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await env.DB.batch(statements.map((line) => env.DB.prepare(line)));
}

async function count(query: string): Promise<number> {
  const row = await env.DB.prepare(query).first<{ n: number }>();
  return row?.n ?? -1;
}

describe("seed/dev.sql", () => {
  it("applies twice without errors or duplicates", async () => {
    await applySeed();
    await applySeed();

    expect(
      await count(
        "SELECT count(*) AS n FROM category WHERE id LIKE '5eed0001-%'"
      )
    ).toBe(5);
    expect(
      await count(
        "SELECT count(*) AS n FROM gesture WHERE id LIKE '5eed0002-%'"
      )
    ).toBe(20);
    expect(
      await count(
        "SELECT count(*) AS n FROM gesture_fts WHERE gesture_id LIKE '5eed0002-%'"
      )
    ).toBe(20);
    expect(
      await count(
        "SELECT count(*) AS n FROM user WHERE email = 'admin@smog.test' AND role = 'admin'"
      )
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM gesture WHERE id LIKE '5eed0002-%' AND playback_id = 'VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU' AND published_at IS NOT NULL"
      )
    ).toBe(20);
    expect(
      await count(
        "SELECT count(*) AS n FROM gesture_fts WHERE gesture_fts MATCH 'hond*'"
      )
    ).toBeGreaterThan(0);
  });

  it("promotes an existing admin@smog.test account instead of failing", async () => {
    await env.DB.prepare(
      "DELETE FROM user WHERE email = 'admin@smog.test'"
    ).run();
    await env.DB.prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('signed-up-admin', 'Dev', 'admin@smog.test', 0, 1, 1)"
    ).run();

    await applySeed();

    const row = await env.DB.prepare(
      "SELECT id, role, email_verified AS verified FROM user WHERE email = 'admin@smog.test'"
    ).first<{ id: string; role: string; verified: number }>();
    expect(row).toEqual({ id: "signed-up-admin", role: "admin", verified: 1 });
  });
});
