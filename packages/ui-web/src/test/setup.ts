import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom must own `document` before Testing Library is loaded, so the
// cleanup hook is imported dynamically after registering.
GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");

afterEach(() => {
  cleanup();
});
