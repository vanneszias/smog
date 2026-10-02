import { createFakeMux, FAKE_MUX_TOKEN } from "@smog/video/testing";

/**
 * The Mux fake every admin test talks to: `test/deps.ts` injects its
 * `fetch`, and `contextAs` gives the rpc env its API URL and token, so
 * `admin.mux.*` runs the real `@smog/video` client against it.
 */
export const testMux = createFakeMux({ apiUrl: "https://api.mux.test" });

export const TEST_MUX_ENV = {
  MUX_API_URL: testMux.apiUrl,
  MUX_TOKEN_ID: FAKE_MUX_TOKEN.id,
  MUX_TOKEN_SECRET: FAKE_MUX_TOKEN.secret,
} as const;
