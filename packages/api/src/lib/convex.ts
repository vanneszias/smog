import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is required");
}

export const convexClient = new ConvexHttpClient(CONVEX_URL);

function getServiceToken(): string {
  const serviceToken = process.env.INTERNAL_API_KEY;
  if (!serviceToken) {
    throw new Error("INTERNAL_API_KEY environment variable is required");
  }
  return serviceToken;
}

export function withServiceAuth<T extends Record<string, unknown>>(
  args: T
): T & { serviceToken: string } {
  return { ...args, serviceToken: getServiceToken() };
}
