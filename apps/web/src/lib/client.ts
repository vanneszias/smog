import { ConvexReactClient } from "convex/react";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("VITE_CONVEX_URL environment variable is not set");
}

export const client = new ConvexReactClient(CONVEX_URL);
