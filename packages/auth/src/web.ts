import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./server";

/** The site's auth client (`/api/auth` on `baseURL`). */
export function createWebAuthClient(baseURL: string) {
  return createAuthClient({
    basePath: "/api/auth",
    baseURL,
    plugins: [
      inferAdditionalFields<Auth>(),
      emailOTPClient(),
      magicLinkClient(),
      passkeyClient(),
      adminClient(),
    ],
  });
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>;
