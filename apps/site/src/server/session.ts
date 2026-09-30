import { getSession, type SessionWithUser } from "@smog/auth";
import { getAuth } from "./auth";

const sessions = new WeakMap<Request, Promise<SessionWithUser | null>>();

/**
 * The request's session, read once per request (one D1 read): the shell
 * loader and the in-process rpc client of the same SSR pass share it.
 */
export function requestSession(
  request: Request
): Promise<SessionWithUser | null> {
  let session = sessions.get(request);
  if (!session) {
    session = getSession(getAuth(), request.headers);
    sessions.set(request, session);
  }
  return session;
}
