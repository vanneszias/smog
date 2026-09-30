/**
 * `bun test --preload @smog/config/testing/happy-dom`: a DOM (happy-dom) for
 * the tests that render with Testing Library (feature hooks, the site's
 * components). Pure tests do not notice it. Tests only; never imported by
 * runtime code.
 *
 * The page has a real origin (the dev site), so `localStorage` works. After
 * each test, Testing Library unmounts what it rendered and `localStorage`
 * is cleared. happy-dom must own `document` before Testing Library is
 * loaded, so both are imported after registering.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

afterEach(() => {
  cleanup();
  localStorage.clear();
});
