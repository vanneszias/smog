import { useEffect, useState } from "react";
import { readLinkToken } from "@/lib/sponsor-search";

function readNow(): string | null {
  const { hash, pathname, search } = window.location;
  const read = readLinkToken({ hash, pathname, search });
  if (read.replaceWith !== null) {
    // The old `?token=` link: the address keeps the token only in the
    // fragment from here on. The router's own history state is kept.
    window.history.replaceState(window.history.state, "", read.replaceWith);
  }
  return read.token;
}

/**
 * The token of a re-edit or renewal link, read from the URL fragment (an old
 * `?token=` is moved there first, `readLinkToken`). `undefined` until the
 * browser has read it (the server never sees it, so the first render, on
 * the server and in the browser, is the neutral loading state); `null`
 * when the link has no valid token. Follows a changed fragment. The token
 * is never logged, stored or sent anywhere but the procedures' bodies.
 */
export function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setToken(readNow());
    const onChange = (): void => setToken(readNow());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return token;
}
