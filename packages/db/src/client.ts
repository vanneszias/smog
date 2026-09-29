import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
// biome-ignore lint/performance/noNamespaceImport: Drizzle takes the schema as one object of every table.
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** A Drizzle client for the `DB` binding with the full schema. */
export function createDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}
