// biome-ignore-all lint/performance/noBarrelFile: the React entry point (`@smog/auth/react`) re-exports the shared auth flow next to the auth state.
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";
import type { Role } from "./fields";

export {
  APP_MAGIC_LINK_PATH,
  MAGIC_LINK_TOKEN_PATTERN,
  MAGIC_LINK_TTL_SECONDS,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./fields";
export {
  CAPTCHA_HEADER,
  createFlowActions,
  type FlowActionOptions,
  type FlowAuthClient,
} from "./flow-actions";
export {
  type AuthErrorField,
  type AuthErrorKey,
  type AuthFlow,
  type AuthFlowActions,
  type AuthFlowCaptcha,
  type AuthFlowState,
  type AuthMethod,
  type AuthMode,
  type AuthNotice,
  type AuthResult,
  type AuthStep,
  authErrorField,
  authErrorKey,
  newPasswordError,
  type SocialProvider,
  toAuthResult,
  useAuthFlow,
} from "./use-auth-flow";

export interface AuthUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
  role: Role;
}

export interface AuthState {
  /**
   * The last session fetch failed (offline, server error). `status`/`user`
   * are then the last known values, so a signed-in user is not treated as a
   * guest while offline.
   */
  error?: true;
  status: "loading" | "signedIn" | "signedOut";
  user?: AuthUser;
}

export interface AuthStateValue extends AuthState {
  /** Refetches the session (after sign-in, or to retry after an error). */
  refetch: () => void;
  /**
   * The same, resolving once the session has been read again (a failure
   * is logged). Account deletion waits on it before clearing the cache.
   */
  refresh: () => Promise<void>;
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
  error?: unknown;
  isPending: boolean;
  refetch?: (() => unknown) | undefined;
}

/**
 * Maps a session hook result to the platform-neutral auth state. On an
 * error it keeps `previous` (the last known state) and flags `error`.
 */
export function toAuthState(
  result: SessionHookResult,
  previous?: AuthState
): AuthState {
  if (result.error) {
    const known =
      previous && previous.status !== "loading"
        ? {
            status: previous.status,
            ...(previous.user ? { user: previous.user } : {}),
          }
        : { status: "signedOut" as const };
    return { ...known, error: true };
  }
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
      // Code and magic-link sign-ups have no name yet.
      name: current.name.trim() || current.email,
      role: current.role === "admin" ? "admin" : "user",
    },
  };
}

const AuthStateContext = createContext<AuthStateValue | null>(null);

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
  const { data, error, isPending, refetch } = useSession();
  const last = useRef<AuthState | undefined>(undefined);
  const value = useMemo((): AuthStateValue => {
    const state = toAuthState({ data, error, isPending }, last.current);
    if (!state.error) {
      last.current = state;
    }
    return {
      ...state,
      refetch: () => {
        refetch?.();
      },
      refresh: async () => {
        try {
          await refetch?.();
        } catch (failure) {
          console.error("[auth] Failed to read the session again:", failure);
        }
      },
    };
  }, [data, error, isPending, refetch]);
  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  );
}

export function useAuthState(): AuthStateValue {
  const state = useContext(AuthStateContext);
  if (!state) {
    throw new Error(
      "[auth] useAuthState must be used inside AuthStateProvider"
    );
  }
  return state;
}
