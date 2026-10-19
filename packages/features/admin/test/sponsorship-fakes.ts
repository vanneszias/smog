/**
 * The fakes behind the sponsorship actions in every admin test: the
 * in-memory Mollie, queues that record what was enqueued, and the Mux
 * fake with the asset `DELETE` the force expire sends (recorded here).
 */

import type { EmailMessage, EventMessage } from "@smog/jobs";
import type { MollieFetch } from "@smog/payments";
import { createFakeMollie, FAKE_MOLLIE_API_KEY } from "@smog/payments/testing";
import type { MuxFetch } from "@smog/video";
import { testMux } from "./mux-fake";

export const testMollie = createFakeMollie({
  apiUrl: "https://api.mollie.test",
});

/** Set to make the next Mollie `DELETE` (a cancel) answer this status. */
export const mollieFaults = { cancelStatus: null as number | null };

/** The Mollie fake, whose cancel can be made to fail (`mollieFaults`). */
export const mollieWithFaults: MollieFetch = (input, init) => {
  const status = mollieFaults.cancelStatus;
  if (init?.method === "DELETE" && status !== null) {
    mollieFaults.cancelStatus = null;
    return Promise.resolve(
      Response.json({ detail: "fault", status, title: "Fault" }, { status })
    );
  }
  return testMollie.fetch(input, init);
};

export const TEST_MOLLIE_ENV = {
  MOLLIE_API_KEY: FAKE_MOLLIE_API_KEY,
  MOLLIE_API_URL: testMollie.apiUrl,
} as const;

/** What the admin enqueued, in order (cleared by `clearQueues`). */
export const enqueued = {
  emails: [] as EmailMessage[],
  events: [] as EventMessage[],
};

export function clearQueues(): void {
  enqueued.emails.length = 0;
  enqueued.events.length = 0;
}

/** Set to make every `EVENTS_QUEUE` send fail (a queue outage). */
export const queueFaults: { events: boolean } = { events: false };

/**
 * The rpc env's `EMAIL_QUEUE` and `EVENTS_QUEUE` (task 4's `RpcEnv`):
 * they record what was sent (`enqueued`).
 */
export const RECORDING_QUEUES = {
  EMAIL_QUEUE: {
    send: (body: EmailMessage) => {
      enqueued.emails.push(body);
      return Promise.resolve();
    },
  } as unknown as Queue,
  EVENTS_QUEUE: {
    send: (body: EventMessage) => {
      if (queueFaults.events) {
        return Promise.reject(new Error("EVENTS_QUEUE is down"));
      }
      enqueued.events.push(body);
      return Promise.resolve();
    },
  } as unknown as Queue,
};

/** The Mux asset ids the admin asked Mux to delete, in order. */
export const deletedAssets: string[] = [];

const ASSET_PATH = /\/video\/v1\/assets\/([^/?]+)$/;

/** Set to make the next asset `DELETE` answer this status (not recorded). */
export const muxFaults = { deleteStatus: null as number | null };

/** The Mux fake, plus `DELETE /video/v1/assets/<id>` (204, recorded). */
export const muxWithDeletes: MuxFetch = (input, init) => {
  const request = new Request(input, init);
  const match = ASSET_PATH.exec(new URL(request.url).pathname);
  if (request.method === "DELETE" && match) {
    const status = muxFaults.deleteStatus;
    if (status !== null) {
      muxFaults.deleteStatus = null;
      return Promise.resolve(new Response(null, { status }));
    }
    deletedAssets.push(decodeURIComponent(match[1] as string));
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return testMux.fetch(input, init);
};
