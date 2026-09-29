import { defineConfig } from "drizzle-kit";

// Generate only (`bun run db:generate`). Migrations are applied by wrangler
// (`wrangler d1 migrations apply DB`), never by drizzle-kit, so no driver or
// credentials are configured here.
export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
});
