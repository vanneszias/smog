// biome-ignore-all lint/performance/noBarrelFile: the `@smog/db/testing` entry point.
import { createDb, type Db } from "../../../db/src/client";

export {
  insertGestures,
  makeCategory,
  makeGesture,
  makeUser,
  SAMPLE_PLAYBACK_ID,
} from "./factories";

export {
  explain,
  fullScans,
  recordingD1,
  scanReport,
} from "./plan";

/** A Drizzle client for a test env's `DB` binding (migrations applied). */
export function createTestDb(env: { DB: D1Database }): Db {
  return createDb(env.DB);
}
