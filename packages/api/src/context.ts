import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  // Extract WorkOS session from Authorization header or cookie
  const authHeader = context.req.raw.headers.get("Authorization");
  const workosId = authHeader?.replace("Bearer ", "") || null;

  return {
    workosId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
