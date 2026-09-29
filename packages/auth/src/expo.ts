import { expoClient } from "@better-auth/expo/client";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import {
  getItem,
  getItemAsync,
  setItem,
  setItemAsync,
} from "expo-secure-store";
import { COOKIE_PREFIX } from "./cookie";
import type { Auth } from "./server";

export interface ExpoAuthClientOptions {
  /** The site origin (`EXPO_PUBLIC_API_URL`). */
  baseURL: string;
  /** The app's deep-link scheme. */
  scheme: "smog";
  /** Prefix of the SecureStore keys. */
  storagePrefix: "smog";
}

/**
 * The mobile auth client: the session cookie lives in SecureStore and the
 * Expo plugin sends it as a `cookie` header (`getCookie()` for oRPC).
 * Passkeys are web-only for now (DECISIONS).
 */
export function createExpoAuthClient({
  baseURL,
  scheme,
  storagePrefix,
}: ExpoAuthClientOptions) {
  return createAuthClient({
    basePath: "/api/auth",
    baseURL,
    plugins: [
      expoClient({
        cookiePrefix: COOKIE_PREFIX,
        scheme,
        storage: { getItem, getItemAsync, setItem, setItemAsync },
        storagePrefix,
      }),
      inferAdditionalFields<Auth>(),
      emailOTPClient(),
      magicLinkClient(),
      adminClient(),
    ],
  });
}

export type ExpoAuthClient = ReturnType<typeof createExpoAuthClient>;
