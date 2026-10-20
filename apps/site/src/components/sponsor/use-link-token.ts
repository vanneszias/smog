import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { readLinkToken } from "@/lib/sponsor-search";

type MoveHistory = (to: string) => void;

function readNow(move: MoveHistory): string | null {
  const { hash, pathname, search } = window.location;
  const read = readLinkToken({ hash, pathname, search });
  if (read.replaceWith !== null) {
    // The old `?token=` link: the address (and the router's own location)
    // keeps the token only in the fragment from here on.
    move(read.replaceWith);
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
  const router = useRouter({ warn: false });
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // Through the router when there is one, so its location and the
    // address agree (a later `<Link search={prev}>` cannot bring the query
    // back); a bare `replaceState` otherwise (tests).
    const move: MoveHistory = (to) => {
      if (router) {
        router.history.replace(to, window.history.state);
      } else {
        window.history.replaceState(window.history.state, "", to);
      }
    };
    setToken(readNow(move));
    const onChange = (): void => setToken(readNow(move));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [router]);
  return token;
}
