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
 *
 * `waitFor` and `findBy*` wait up to 5 s (Testing Library's default is 1 s,
 * which one slow render under the whole turbo test run can pass). The test
 * scripts pass `--timeout=20000` so a test outlives its own `waitFor`.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { afterEach } = await import("bun:test");
const { cleanup, configure } = await import("@testing-library/react");

configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});
