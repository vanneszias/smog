import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ApiClient, createApiQueryUtils } from "@smog/api/client";
import { createExpoAuthClient, type ExpoAuthClient } from "@smog/auth/expo";
import {
  AuthStateProvider,
  type SessionHookResult,
  useAuthState,
} from "@smog/auth/react";
import { isLocalizedQuery } from "@smog/gestures/client";
import { languageCodes, registerLanguages } from "@smog/i18n";
import { setupNative } from "@smog/i18n/native";
import { I18nextProvider } from "@smog/i18n/react";
import { createLocalStore, type LocalStore } from "@smog/local-store";
import { nativeAdapter } from "@smog/local-store/native";
import { LocalStoreProvider } from "@smog/local-store/react";
import { PurgeOtherUsers, purgeOtherUsers, RpcProvider } from "@smog/rpc/react";
import {
  QueryClient,
  useIsRestoring,
  useQueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { runtimeVersion, updateId } from "expo-updates";
import { useColorScheme } from "nativewind";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createMobileAnalytics,
  type MobileAnalytics,
  MobileAnalyticsProvider,
} from "@/analytics";
import { createMobileApiClient } from "@/lib/api";
import { appScheme } from "@/lib/app-scheme";
import { AuthClientProvider } from "@/lib/auth-client";
import { useRuntimeCatalogue } from "@/lib/catalogue";
import { mobileEnv } from "@/lib/env";
import { connectQueryToDevice } from "@/lib/network";
import { usePreferences } from "@/lib/preferences";
import {
  cacheBuster,
  createPersistOptions,
  keepPersistedQueries,
  type PersistStorage,
} from "@/lib/query-persist";
import { setRequestedLocale } from "@/lib/request-locale";

export interface AppClients {
  /** Consent-gated; tests leave it out (a no-op). */
  analytics?: MobileAnalytics;
  api: ApiClient;
  auth: ExpoAuthClient;
  /** Where the offline query cache lives (AsyncStorage in the app). */
  cacheStorage: PersistStorage;
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

/** This bundle's cache buster: the app version and the OTA update. */
export function appCacheBuster(): string {
  return cacheBuster({
    runtimeVersion,
    updateId,
    version: Constants.expoConfig?.version,
  });
}

/** The app's clients: one each, for the whole app lifetime. */
function createAppClients(): AppClients {
  const auth = createExpoAuthClient({
    baseURL: mobileEnv().EXPO_PUBLIC_API_URL,
    scheme: appScheme(),
    storagePrefix: "smog",
  });
  const queryClient = new QueryClient();
  keepPersistedQueries(queryClient);
  const store = createLocalStore(nativeAdapter);
  return {
    analytics: createMobileAnalytics(),
    api: createMobileApiClient(auth),
    auth,
    cacheStorage: AsyncStorage,
    queryClient,
    store,
    useSession: sessionHook(auth),
  };
}

/**
 * Once the persisted cache is restored, drops any other user's queries
 * from it: `<PurgeOtherUsers />` runs on auth changes, which may settle
 * before the restore finishes.
 */
function PurgeRestoredQueries(): null {
  const isRestoring = useIsRestoring();
  const { status, user } = useAuthState();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (!isRestoring && status !== "loading") {
      purgeOtherUsers(queryClient, userId);
    }
  }, [isRestoring, queryClient, status, userId]);
  return null;
}

/** Theme and language follow the stored preferences (local-store). */
function PreferencesRoot({ children }: { children: ReactNode }): ReactElement {
  const [{ locale, theme }] = usePreferences();
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(theme);
  }, [setColorScheme, theme]);
  // The catalogue answers in the language the requests ask for (the stored
  // choice, else the device's). Set while rendering, so the first requests
  // already carry it; a later change drops the cached answers, which are in
  // the old language, and the active queries refetch.
  const queryClient = useQueryClient();
  const { languages, overlay, wanted } = useRuntimeCatalogue();
  const applied = useRef<string | null | undefined>(undefined);
  setRequestedLocale(wanted);
  useEffect(() => {
    if (applied.current !== undefined && applied.current !== wanted) {
      queryClient.resetQueries({ predicate: isLocalizedQuery }).catch(() => {
        // A failed refetch shows its own error state.
      });
    }
    applied.current = wanted;
  }, [queryClient, wanted]);
  // The bundled catalogue first (offline works from it), then the enabled
  // languages and the ui_string overlay of the last `system.i18n` answer: a
  // language change or a fresh answer hot-swaps the instance.
  registerLanguages(languages);
  const i18n = useMemo(
    () =>
      setupNative({
        enabled: languageCodes(languages),
        overlay,
        preference: locale,
      }),
    [languages, locale, overlay]
  );
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * Every app-wide provider: TanStack Query (persisted for offline use and
 * paused while offline, `@/lib/query-persist`), oRPC, the auth client and
 * its state, the local store, analytics, then theme and language from its
 * preferences. Tests pass fakes as `clients`.
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
  const persistOptions = useMemo(
    () =>
      createPersistOptions({
        buster: appCacheBuster(),
        storage: clients.cacheStorage,
      }),
    [clients.cacheStorage]
  );
  useEffect(() => connectQueryToDevice(), []);
  return (
    <PersistQueryClientProvider
      client={clients.queryClient}
      persistOptions={persistOptions}
    >
      <RpcProvider client={clients.api} queryUtils={queryUtils}>
        <AuthClientProvider client={clients.auth}>
          <AuthStateProvider useSession={clients.useSession}>
            <PurgeOtherUsers />
            <PurgeRestoredQueries />
            <LocalStoreProvider store={clients.store}>
              <MobileAnalyticsProvider value={clients.analytics}>
                <PreferencesRoot>{children}</PreferencesRoot>
              </MobileAnalyticsProvider>
            </LocalStoreProvider>
          </AuthStateProvider>
        </AuthClientProvider>
      </RpcProvider>
    </PersistQueryClientProvider>
  );
}
