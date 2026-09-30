import { jest } from "@jest/globals";
import { createApiClient } from "@smog/api/client";
import type { ExpoAuthClient } from "@smog/auth/expo";
import type { SessionHookResult } from "@smog/auth/react";
import {
  createLocalStore,
  createMemoryAdapter,
  type GuestData,
} from "@smog/local-store";
import { QueryClient } from "@tanstack/react-query";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { AppShell } from "@/app-shell";
import type { PersistStorage } from "@/lib/query-persist";
import { type AppClients, AppProviders, sessionHook } from "@/providers";

/*
 * The app's real routes and providers over a fake API: `renderApp` mounts
 * the root stack, the tabs and the learning screens with an oRPC client
 * whose fetch answers from `routes`, a memory local store and a guest or
 * signed-in session. No network, no SecureStore.
 */

export const HOND = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  id: "g-hond",
  name: "Hond",
  playbackId: "playback-hond",
  slug: "hond",
};
export const KAT = {
  categories: [{ name: "Dieren", slug: "dieren" }],
  id: "g-kat",
  name: "Kat",
  playbackId: "playback-kat",
  slug: "kat",
};

/** An error as the site's RPC handler sends it (a typed, defined error). */
export function rpcError(code: string, status: number): Response {
  return Response.json(
    { json: { code, defined: true, message: code, status } },
    { status }
  );
}

/** One procedure's answer: its output, or a Response (an error). */
type RouteAnswer =
  | unknown
  | ((input: unknown) => unknown)
  | { response: Response };

type Routes = Record<string, RouteAnswer>;

/** The catalogue every screen can read. */
const CATALOG_ROUTES: Routes = {
  "gestures/byIds": (input: unknown) => {
    const { ids } = input as { ids: string[] };
    return [HOND, KAT].filter((gesture) => ids.includes(gesture.id));
  },
  "gestures/bySlug": (input: unknown) => {
    const { slug } = input as { slug: string };
    const gesture = [HOND, KAT].find(
      (item) => item.slug === slug || item.id === slug
    );
    if (!gesture) {
      return { response: rpcError("NOT_FOUND", 404) };
    }
    return {
      ...gesture,
      canonicalSlug: gesture.slug,
      description: `Het gebaar voor ${gesture.name.toLowerCase()}.`,
      keywords: ["huisdier"],
      publishedAt: 0,
      sponsor: null,
      updatedAt: 0,
    };
  },
  "gestures/categories": [{ gestureCount: 2, name: "Dieren", slug: "dieren" }],
  "gestures/list": { items: [HOND, KAT], nextCursor: null },
  "gestures/related": (input: unknown) => {
    const { slug } = input as { slug: string };
    return [HOND, KAT].filter((gesture) => gesture.slug !== slug);
  },
  "gestures/search": (input: unknown) => {
    const { q } = input as { q: string };
    const items = [HOND, KAT]
      .filter((gesture) => gesture.name.toLowerCase().includes(q.toLowerCase()))
      .map((gesture) => ({
        ...gesture,
        matchedField: q ? "name" : null,
        matchType: q ? "startsWith" : null,
        score: q ? 1 : 0,
      }));
    return { items, total: items.length };
  },
};

function answer(route: RouteAnswer, input: unknown): Response {
  const value = typeof route === "function" ? route(input) : route;
  if (
    typeof value === "object" &&
    value !== null &&
    "response" in value &&
    value.response instanceof Response
  ) {
    return value.response;
  }
  return Response.json({ json: value ?? null, meta: [] });
}

/** A fetch that answers `/api/rpc/<path>` from `routes` (404 otherwise). */
function fakeFetch(
  routes: Routes
): jest.Mock<(request: Request) => Promise<Response>> {
  return jest.fn(async (request: Request) => {
    const path = new URL(request.url).pathname.replace("/api/rpc/", "");
    const route = routes[path];
    if (route === undefined) {
      return rpcError("NOT_FOUND", 404);
    }
    let input: unknown;
    if (request.method === "GET") {
      const data = new URL(request.url).searchParams.get("data");
      input = data ? (JSON.parse(data) as { json?: unknown }).json : undefined;
    } else {
      const text = await request.text();
      input = text ? (JSON.parse(text) as { json?: unknown }).json : undefined;
    }
    return answer(route, input);
  });
}

const USER = {
  email: "an@smog.test",
  id: "u-an",
  image: null,
  name: "An",
  role: "user",
};

function guestData(partial: Partial<GuestData> = {}): GuestData {
  return {
    consent: { analytics: null },
    favorites: [],
    lists: [],
    preferences: {
      importDismissedFor: [USER.id],
      locale: "en",
      theme: "light",
    },
    recentSearches: [],
    version: 2,
    ...partial,
  };
}

/** AsyncStorage's API over a Map. */
export function memoryStorage(): PersistStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    map,
    removeItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

export interface RenderAppOptions {
  cacheStorage?: PersistStorage;
  /** Replaces the fake API fetch (e.g. one that always fails, offline). */
  fetch?: (request: Request) => Promise<Response>;
  guest?: Partial<GuestData>;
  initialUrl?: string;
  queryClient?: QueryClient;
  routes?: Routes;
  signedIn?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: route modules as expo-router's test renderer takes them
type RouteModule = any;

/** Sign-in has its own tests; here it only has to be reached. */
function SignInStub(): ReactElement {
  return <Text testID="sign-in-screen">sign in</Text>;
}

function SettingsStub(): ReactElement {
  return <Text testID="settings-screen">settings</Text>;
}

/** The app's routes, as files (`require` keeps the real module objects). */
function appRoutes(root: () => ReactElement): Record<string, RouteModule> {
  const layout = require("../../app/_layout");
  return {
    _layout: { default: root, unstable_settings: layout.unstable_settings },
    "(auth)/_layout": require("../../app/(auth)/_layout"),
    "(auth)/sign-in": { default: SignInStub },
    "(tabs)/_layout": require("../../app/(tabs)/_layout"),
    "(tabs)/favorites/_layout": require("../../app/(tabs)/favorites/_layout"),
    "(tabs)/favorites/index": require("../../app/(tabs)/favorites/index"),
    "(tabs)/index": require("../../app/(tabs)/index"),
    "(tabs)/lists/_layout": require("../../app/(tabs)/lists/_layout"),
    "(tabs)/lists/[id]": require("../../app/(tabs)/lists/[id]"),
    "(tabs)/lists/index": require("../../app/(tabs)/lists/index"),
    "(tabs)/search/_layout": require("../../app/(tabs)/search/_layout"),
    "(tabs)/search/index": require("../../app/(tabs)/search/index"),
    "+native-intent": require("../../app/+native-intent"),
    "gestures/[slug]": require("../../app/gestures/[slug]"),
    "settings/_layout": require("../../app/settings/_layout"),
    "settings/index": { default: SettingsStub },
    "shared/[token]": require("../../app/shared/[token]"),
  };
}

export interface RenderedApp {
  clients: AppClients;
  fetch: jest.Mock<(request: Request) => Promise<Response>>;
  result: ReturnType<typeof renderRouter>;
}

/** Renders the app at `initialUrl` (home by default). */
export async function renderApp({
  cacheStorage = memoryStorage(),
  fetch: customFetch,
  guest,
  initialUrl = "/",
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  }),
  routes = {},
  signedIn = false,
}: RenderAppOptions = {}): Promise<RenderedApp> {
  const fetch = customFetch
    ? jest.fn(customFetch)
    : fakeFetch({ ...CATALOG_ROUTES, ...routes });
  const session: SessionHookResult = {
    data: signedIn ? { user: USER } : null,
    error: null,
    isPending: false,
  };
  const auth = {
    getCookie: () => (signedIn ? "smog.session_token=t" : ""),
    useSession: () => session,
  } as unknown as ExpoAuthClient;
  const clients: AppClients = {
    api: createApiClient({ baseUrl: "https://smog.test", fetch }),
    auth,
    cacheStorage,
    queryClient,
    store: createLocalStore(
      createMemoryAdapter({ "smog:guest:v1": JSON.stringify(guestData(guest)) })
    ),
    useSession: sessionHook(auth),
  };
  function Root(): ReactElement {
    return (
      <AppProviders clients={clients}>
        <AppShell />
      </AppProviders>
    );
  }
  // RNTL 14 renders asynchronously: the router helpers (`getPathname`) are
  // on the returned promise, which resolves once the first render is done.
  const result = renderRouter(appRoutes(Root), { initialUrl });
  await result;
  return { clients, fetch, result };
}
