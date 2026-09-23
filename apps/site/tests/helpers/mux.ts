import type { Page } from "@playwright/test";

/** Mux's hosts, which a sandboxed or offline machine cannot reach. */
const MUX_HOSTS = [
  "https://stream.mux.com/**",
  "https://image.mux.com/**",
  "https://inferred.litix.io/**",
];

/**
 * Holds every Mux request open for ever.
 *
 * Without this the outcome of any test that touches the player depends on
 * whether the machine running it can reach Mux: online it plays, offline it
 * errors into the wrapper's empty state and the element is gone before an
 * assertion can see it. Stalling makes "the element mounted and upgraded" the
 * only thing under test, identically on both kinds of machine.
 *
 * Shared by the kitchen-sink spec and the gesture detail spec rather than
 * copied into each: a second copy is how one of them quietly stops covering a
 * host the player started calling.
 */
export async function stallMux(page: Page): Promise<void> {
  for (const host of MUX_HOSTS) {
    await page.route(host, () => {
      /* never settled on purpose */
    });
  }
}

/** Fails every Mux request outright, for the error-state assertions. */
export async function abortMux(page: Page): Promise<void> {
  for (const host of MUX_HOSTS) {
    await page.route(host, (route) => route.abort());
  }
}
