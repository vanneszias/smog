import { GlobalRegistrator } from "@happy-dom/global-registrator";

/*
 * `bun test --preload ./src/test/dom-setup.ts src`: the component tests
 * (`src/**\/*.test.tsx`) render with Testing Library in happy-dom. The Worker
 * tests (`test/`, Vitest in workerd) never load this.
 *
 * happy-dom must own `document` before Testing Library is loaded, so the
 * cleanup hook is imported after registering.
 */
GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

afterEach(() => {
  cleanup();
  localStorage.clear();
});
