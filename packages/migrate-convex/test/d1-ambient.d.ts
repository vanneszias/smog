/**
 * The Bun programme (the CLI and the Bun tests) reaches `@smog/db`'s
 * `createDb(d1: D1Database)` through the core's imports, but never opens
 * a D1 binding: it runs wrangler instead. This names the Workers type
 * there without loading the Workers runtime types, which clash with Bun's.
 */
type D1Database = import("drizzle-orm/d1").AnyD1Database;
