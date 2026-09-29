import { type ApiClient, createApiQueryUtils } from "@smog/api/client";
import { createExpoAuthClient, type ExpoAuthClient } from "@smog/auth/expo";
import { AuthStateProvider, type SessionHookResult } from "@smog/auth/react";
import { setupNative } from "@smog/i18n/native";
import { I18nextProvider } from "@smog/i18n/react";
import { createLocalStore, type LocalStore } from "@smog/local-store";
import { nativeAdapter } from "@smog/local-store/native";
import { LocalStoreProvider } from "@smog/local-store/react";
import { RpcProvider } from "@smog/rpc/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "nativewind";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createMobileApiClient } from "@/lib/api";
import { AuthClientProvider } from "@/lib/auth-client";
import { mobileEnv } from "@/lib/env";
import { usePreferences } from "@/lib/preferences";

export interface AppClients {
  api: ApiClient;
  auth: ExpoAuthClient;
  queryClient: QueryClient;
  store: LocalStore;
  /** `auth.useSession`, as `AuthStateProvider` takes it. */
  useSession: () => SessionHookResult;
}

/** The auth client's session hook, as a plain hook function. */
export function sessionHook(auth: ExpoAuthClient): () => SessionHookResult {
  return function useAppSession(): SessionHookResult {
    return auth.useSession();
  };
}

/** The app's clients: one each, for the whole app lifetime. */
function createAppClients(): AppClients {
  const auth = createExpoAuthClient({
    baseURL: mobileEnv().EXPO_PUBLIC_API_URL,
    scheme: "smog",
    storagePrefix: "smog",
  });
  return {
    api: createMobileApiClient(auth),
    auth,
    queryClient: new QueryClient(),
    store: createLocalStore(nativeAdapter),
    useSession: sessionHook(auth),
  };
}

/** Theme and language follow the stored preferences (local-store). */
function PreferencesRoot({ children }: { children: ReactNode }): ReactElement {
  const [{ locale, theme }] = usePreferences();
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(theme);
  }, [setColorScheme, theme]);
  const i18n = useMemo(() => setupNative({ preference: locale }), [locale]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * Every app-wide provider: TanStack Query, oRPC, the auth client and its
 * state, the local store, then theme and language from its preferences.
 * Tests pass fakes as `clients`.
 */
export function AppProviders({
  children,
  clients: injected,
}: {
  children: ReactNode;
  clients?: AppClients;
}): ReactElement {
  const [clients] = useState(() => injected ?? createAppClients());
  const queryUtils = useMemo(
    () => createApiQueryUtils(clients.api),
    [clients.api]
  );
  return (
    <QueryClientProvider client={clients.queryClient}>
      <RpcProvider client={clients.api} queryUtils={queryUtils}>
        <AuthClientProvider client={clients.auth}>
          <AuthStateProvider useSession={clients.useSession}>
            <LocalStoreProvider store={clients.store}>
              <PreferencesRoot>{children}</PreferencesRoot>
            </LocalStoreProvider>
          </AuthStateProvider>
        </AuthClientProvider>
      </RpcProvider>
    </QueryClientProvider>
  );
}
