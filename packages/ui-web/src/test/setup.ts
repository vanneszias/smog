import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom must own `document` before Testing Library is loaded, so the
// cleanup hook is imported dynamically after registering. `waitFor` waits up
// to 5 s (the default 1 s is passed by one slow render under the whole turbo
// test run); the test script's `--timeout=20000` outlives it.
GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { afterEach } = await import("bun:test");
const { cleanup, configure } = await import("@testing-library/react");

configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
