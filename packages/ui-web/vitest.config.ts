import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Testing Library registers its own `afterEach` cleanup only when a global
    // `afterEach` exists. Without this the DOM from one test leaks into the
    // next and `getByRole` starts finding two buttons.
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
