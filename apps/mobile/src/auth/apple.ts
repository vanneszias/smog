import type { ExpoAuthClient } from "@smog/auth/expo";
import { type AuthResult, toAuthResult } from "@smog/auth/react";
import {
  AppleAuthenticationScope,
  isAvailableAsync,
  signInAsync,
} from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/** Sign in with Apple exists on iOS 13+ only. */
async function appleSignInAvailable(): Promise<boolean> {
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

/** Whether Sign in with Apple can be offered here (false until known). */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    appleSignInAvailable().then((value) => {
      if (active) {
        setAvailable(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
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
 * The native Apple sheet's identity token, or `null` when it was cancelled
 * or failed (logged). Sign-in and linking both send it to Better Auth.
 */
export async function appleIdentityToken(): Promise<string | null> {
  try {
    const credential = await signInAsync({
      requestedScopes: [
        AppleAuthenticationScope.FULL_NAME,
        AppleAuthenticationScope.EMAIL,
      ],
    });
    return credential.identityToken ?? null;
  } catch (error) {
    if (!cancelled(error)) {
      console.error("[auth] Failed to sign in with Apple:", error);
    }
    return null;
  }
}

/**
 * The native Apple sheet, then Better Auth's idToken sign-in (spec §6);
 * no browser is involved.
 */
export async function signInWithApple(
  client: Pick<ExpoAuthClient, "signIn">
): Promise<AuthResult> {
  const token = await appleIdentityToken();
  if (!token) {
    return { error: "socialFailed", ok: false };
  }
  try {
    return toAuthResult(
      await client.signIn.social({ idToken: { token }, provider: "apple" })
    );
  } catch (error) {
    console.error("[auth] Failed to sign in with Apple:", error);
    return { error: "socialFailed", ok: false };
  }
}
