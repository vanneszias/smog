import { describe, expect, it, jest } from "@jest/globals";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { type Href, router } from "expo-router";
import { act, screen } from "expo-router/testing-library";
import {
  HOND,
  KAT,
  type RenderAppOptions,
  renderApp,
} from "../../../support/mobile/harness";
import {
  auditInteractive,
  formatFindings,
  interactiveHosts,
} from "../../../support/ui-native/a11y-audit";

// The real auth client (Better Auth, SecureStore) is never built: tests pass fakes.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../../../../../apps/mobile/global.css", () => ({}));
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: () => undefined,
      toggleColorScheme: () => undefined,
    }),
  };
});

/**
 * Phase 9 ruling 3, the mobile half: every screen of `screens.test.tsx` (and
 * the account and sign-in screens), rendered the way those tests render them,
 * is audited the way the kit is (`@smog/ui-native/a11y-audit`): every
 * interactive element has a role, an accessible name and a 44 x 44 pt hit
 * area (`hitSlop` counts). A VoiceOver / TalkBack pass on a device is an
 * owner action; this is the part a machine can hold.
 */

const ME = {
  createdAt: 1000,
  email: "an@smog.test",
  emailVerified: true,
  id: "u-an",
  image: null,
  locale: null,
  methods: { apple: false, google: true, passkeys: 0, password: true },
  name: "An",
  role: "user",
};

const DECIDED = {
  analytics: false,
  decidedAt: 10,
  needsDecision: false,
  policyVersion: CONSENT_POLICY_VERSION,
};

const ACCOUNT_LIST = {
  description: null,
  id: "list-1",
  itemCount: 1,
  name: "Dieren op school",
  shares: { edit: false, view: true },
  updatedAt: 3,
};

const LOCAL_LIST = {
  createdAt: 1,
  gestureIds: [HOND.id, KAT.id],
  id: "loc_les-1",
  name: "Les 1",
  updatedAt: 2,
};

const SHARED = {
  items: [{ ...HOND, position: 0 }],
  list: { description: null, name: "Klas 2B", ownerName: "Els" },
  role: "edit",
};

const ACCOUNT_ROUTES = {
  "account/consent/get": DECIDED,
  "account/me": ME,
  "system/authConfig": { apple: false, google: true },
};

interface ScreenCase {
  name: string;
  options: RenderAppOptions;
  /** A route to open after the first render (a deep link to it would go to `/`). */
  push?: Href;
  /** Text that is on the screen once its data has loaded. */
  ready: string | RegExp;
  /** Or a test id, for a screen that has no text of its own to wait for. */
  readyTestId?: string;
}

const LESSON_ITEM = {
  hasDrawing: false,
  id: "g-hond",
  name: "Hond",
  playbackId: "playback-hond",
  published: true,
  slug: "hond",
};

const LESSON_ROUTES = {
  "lessons/get": {
    authorId: "u-els",
    authorName: "Els",
    canEdit: false,
    createdAt: 0,
    id: "l1",
    number: 1,
    sections: [
      {
        id: "s-1",
        items: [{ ...LESSON_ITEM, id: "g-oud", name: "Oud", published: false }],
        titles: { en: "Pets" },
      },
    ],
    translations: { en: { notes: "Notes", title: "Dieren" } },
    ungrouped: [LESSON_ITEM],
    updatedAt: 1,
    version: 1,
  },
  "lessons/list": {
    items: [
      {
        authorName: "Els",
        canEdit: false,
        gestureCount: 2,
        id: "l1",
        mine: false,
        number: 1,
        title: "Dieren",
        titleLocale: "nl",
        updatedAt: 1,
        version: 1,
      },
    ],
    nextCursor: null,
  },
};

const SCREENS: ScreenCase[] = [
  {
    name: "home",
    options: { initialUrl: "/" },
    ready: "Gestures that support your speech",
  },
  {
    name: "home (continue where you left off)",
    options: {
      guest: {
        preferences: {
          importDismissedFor: [],
          locale: "en",
          recentGestureIds: [KAT.id],
          theme: "light",
        },
      },
      initialUrl: "/",
    },
    ready: "Continue where you left off",
  },
  {
    name: "search (matching categories)",
    options: { initialUrl: "/search?q=dier" },
    ready: "Categories",
  },
  {
    name: "search results",
    options: { initialUrl: "/search?q=kat" },
    ready: "1 gesture",
  },
  {
    name: "search without results",
    options: { initialUrl: "/search?q=olifant" },
    ready: "No gestures found",
  },
  {
    name: "favorites (guest, empty)",
    options: { initialUrl: "/favorites" },
    ready: "No favorites yet",
  },
  {
    name: "favorites (guest)",
    options: { guest: { favorites: [HOND.id] }, initialUrl: "/favorites" },
    ready: "Hond",
  },
  {
    name: "lists (guest)",
    options: { guest: { lists: [LOCAL_LIST] }, initialUrl: "/lists" },
    ready: "Les 1",
  },
  {
    name: "lists (signed in)",
    options: {
      initialUrl: "/lists",
      routes: { "lists/mine": [ACCOUNT_LIST] },
      signedIn: true,
    },
    ready: "Dieren op school",
  },
  {
    name: "list",
    options: { guest: { lists: [LOCAL_LIST] }, initialUrl: "/lists" },
    push: "/lists/loc_les-1",
    ready: "",
    readyTestId: "drag-g-hond",
  },
  {
    name: "list not found",
    options: { initialUrl: "/lists/loc_gone" },
    ready: "List not found",
  },
  {
    name: "gesture",
    options: { initialUrl: "/gestures/hond" },
    ready: "Related gestures",
  },
  {
    name: "gesture not found",
    options: { initialUrl: "/gestures/olifant" },
    ready: "Gesture not found",
  },
  {
    name: "shared list (editor)",
    options: {
      initialUrl: "/shared/tok-edit",
      routes: { "lists/shared/get": SHARED },
      signedIn: true,
    },
    ready: "Shared by Els",
  },
  {
    name: "shared list (guest)",
    options: {
      initialUrl: "/shared/tok-edit",
      routes: { "lists/shared/get": SHARED },
    },
    ready: "Sign in to add or remove gestures.",
  },
  {
    name: "account (signed in)",
    options: { routes: ACCOUNT_ROUTES, signedIn: true },
    push: "/settings/account",
    ready: "Sign out",
  },
  {
    name: "account (guest)",
    options: { routes: { "account/consent/get": DECIDED } },
    push: "/settings/account",
    ready: "Sign in",
  },
  {
    name: "lessons (teacher)",
    options: { roles: ["teacher"], routes: LESSON_ROUTES, signedIn: true },
    push: "/settings/lessons",
    ready: "Dieren",
  },
  {
    name: "lesson (teacher)",
    options: { roles: ["teacher"], routes: LESSON_ROUTES, signedIn: true },
    push: "/settings/lessons/l1",
    ready: "Export as PDF",
  },
  {
    name: "sign in",
    options: {
      authScreens: true,
      initialUrl: "/sign-in",
      routes: {
        "system/authConfig": {
          apple: false,
          google: false,
          turnstileSiteKey: null,
        },
      },
    },
    ready: "Continue",
  },
];

describe("every screen, audited", () => {
  it.each(SCREENS)("$name: a role and a name on every control", async (row) => {
    await renderApp(row.options);
    if (row.push) {
      const target = row.push;
      await act(() => {
        router.push(target);
      });
    }
    if (row.readyTestId) {
      await screen.findByTestId(row.readyTestId);
    } else {
      await screen.findAllByText(row.ready);
    }
    await act(() => Promise.resolve());
    expect(interactiveHosts().length).toBeGreaterThan(0);
    expect(formatFindings(auditInteractive({ targets: false }))).toEqual([]);
  });

  it("covers the screens of screens.test.tsx", () => {
    // A new route file needs a row above (or a reason here).
    const routes = new Set(SCREENS.map((row) => row.options.initialUrl));
    for (const url of [
      "/",
      "/search?q=kat",
      "/favorites",
      "/lists",
      "/gestures/hond",
      "/shared/tok-edit",
      "/sign-in",
    ]) {
      expect(routes.has(url)).toBe(true);
    }
    const pushed = new Set<Href | undefined>(SCREENS.map((row) => row.push));
    for (const url of [
      "/lists/loc_les-1",
      "/settings/account",
      "/settings/lessons",
      "/settings/lessons/l1",
    ] as const) {
      expect(pushed.has(url)).toBe(true);
    }
  });
});
