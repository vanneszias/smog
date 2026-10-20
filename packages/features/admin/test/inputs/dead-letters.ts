import { env } from "cloudflare:workers";
import type { ProcedureInputs } from "./index";

/** An open, replayable dead letter from the events queue; returns its id. */
async function openEvent(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO dead_letter (id, queue, origin_queue, type, attempts, received_at, body, replayable) VALUES (?, 'smog-dev-sponsorship-events-dlq', 'events', 'render.requested', 11, ?, ?, 1)"
  )
    .bind(
      id,
      Date.now(),
      JSON.stringify({ renderJobId: id, type: "render.requested" })
    )
    .run();
  return id;
}

/**
 * For each `admin.deadLetters` procedure, a function from the fixtures to
 * an input the admin call succeeds with: a replay and a discard each get a
 * fresh open row (and prove their audit entry through the guard).
 */
export const DEAD_LETTERS_INPUTS: ProcedureInputs = {
  "deadLetters.discard": async () => ({ id: await openEvent() }),
  "deadLetters.list": () => ({}),
  "deadLetters.replay": async () => ({ id: await openEvent() }),
};
