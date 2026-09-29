import type { ExpoAuthClient } from "@smog/auth/expo";
import { type AuthResult, toAuthResult } from "@smog/auth/react";
import {
  AppleAuthenticationScope,
  isAvailableAsync,
  signInAsync,
} from "expo-apple-authentication";
import { Platform } from "react-native";

/** Sign in with Apple exists on iOS 13+ only. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return false;
  }
  try {
    return await isAvailableAsync();
  } catch (error) {
    console.error("[auth] Failed to check Sign in with Apple:", error);
    return false;
  }
}

function cancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_REQUEST_CANCELED"
  );
}

/**
 * The native Apple sheet, then Better Auth's idToken sign-in (spec §6);
 * no browser is involved.
 */
export async function signInWithApple(
  client: Pick<ExpoAuthClient, "signIn">
): Promise<AuthResult> {
  try {
    const credential = await signInAsync({
      requestedScopes: [
        AppleAuthenticationScope.FULL_NAME,
        AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { error: "socialFailed", ok: false };
    }
    return toAuthResult(
      await client.signIn.social({
        idToken: { token: credential.identityToken },
        provider: "apple",
      })
    );
  } catch (error) {
    if (!cancelled(error)) {
      console.error("[auth] Failed to sign in with Apple:", error);
    }
    return { error: "socialFailed", ok: false };
  }
}
