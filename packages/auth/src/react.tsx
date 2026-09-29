import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Role } from "./session";

export interface AuthUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
  role: Role;
}

export interface AuthState {
  status: "loading" | "signedIn" | "signedOut";
  user?: AuthUser;
}

/** The shape of Better Auth's `useSession()` on web and Expo. */
export interface SessionHookResult {
  data:
    | {
        user: {
          email: string;
          id: string;
          image?: string | null | undefined;
          name: string;
          role?: string | null | undefined;
        };
      }
    | null
    | undefined;
  isPending: boolean;
}

/** Maps a session hook result to the platform-neutral auth state. */
export function toAuthState(result: SessionHookResult): AuthState {
  if (result.isPending) {
    return { status: "loading" };
  }
  const current = result.data?.user;
  if (!current) {
    return { status: "signedOut" };
  }
  return {
    status: "signedIn",
    user: {
      email: current.email,
      id: current.id,
      image: current.image ?? null,
      name: current.name,
      role: current.role === "admin" ? "admin" : "user",
    },
  };
}

const AuthStateContext = createContext<AuthState | null>(null);

/**
 * Provides the auth state from an injected session hook
 * (`webAuthClient.useSession` or `expoAuthClient.useSession`), so feature
 * hooks read `useAuthState()` and never import a platform client.
 */
export function AuthStateProvider({
  children,
  useSession,
}: {
  children: ReactNode;
  useSession: () => SessionHookResult;
}): ReactNode {
  const result = useSession();
  const { data, isPending } = result;
  const state = useMemo(
    () => toAuthState({ data, isPending }),
    [data, isPending]
  );
  return (
    <AuthStateContext.Provider value={state}>
      {children}
    </AuthStateContext.Provider>
  );
}

export function useAuthState(): AuthState {
  const state = useContext(AuthStateContext);
  if (!state) {
    throw new Error(
      "[auth] useAuthState must be used inside AuthStateProvider"
    );
  }
  return state;
}
