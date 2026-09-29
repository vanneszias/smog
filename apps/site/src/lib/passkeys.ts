import { useEffect, useState } from "react";

/**
 * Whether this browser has WebAuthn. `false` on the server and during
 * hydration, so the passkey buttons never cause a mismatch.
 */
export function usePasskeySupport(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof window.PublicKeyCredential === "function");
  }, []);
  return supported;
}
