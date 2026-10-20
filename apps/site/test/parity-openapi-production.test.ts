import { describe, expect, it, vi } from "vitest";

// A production-env pin for inventory P-34 (phase 9 task 9): the reference
// is dev and staging only, so in production every method and path under
// /api/openapi answers 404 before the OpenAPI handler is even imported.
vi.mock("../src/server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/server/auth")>();
  return {
    ...original,
    siteEnv: () => {
      const real = original.siteEnv();
      return { ...real, vars: { ...real.vars, ENVIRONMENT: "production" } };
    },
  };
});

const { handleOpenApi } = await import("../src/server/rpc");

describe("/api/openapi in production (P-34)", () => {
  it.each([
    ["GET", "/api/openapi"],
    ["GET", "/api/openapi/spec.json"],
    ["POST", "/api/openapi/gestures/list"],
  ])("%s %s is a bare 404", async (method, path) => {
    const response = await handleOpenApi(
      new Request(`https://example.test${path}`, { method })
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
