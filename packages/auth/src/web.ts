import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { USER_ADDITIONAL_FIELDS } from "./fields";

/** The site's auth client (`/api/auth` on `baseURL`). */
export function createWebAuthClient(baseURL: string) {
  return createAuthClient({
    basePath: "/api/auth",
    baseURL,
    plugins: [
      inferAdditionalFields({ user: USER_ADDITIONAL_FIELDS }),
      emailOTPClient(),
      magicLinkClient(),
      passkeyClient(),
      adminClient(),
    ],
  });
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>;
