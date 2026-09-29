// biome-ignore-all lint/performance/noBarrelFile: the `@smog/db/testing` entry point.
import { createDb, type Db } from "../client";

export {
  makeCategory,
  makeGesture,
  makeUser,
  SAMPLE_PLAYBACK_ID,
} from "./factories";

/** A Drizzle client for a test env's `DB` binding (migrations applied). */
export function createTestDb(env: { DB: D1Database }): Db {
  return createDb(env.DB);
}
