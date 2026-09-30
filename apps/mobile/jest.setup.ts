import { jest } from "@jest/globals";

// The app's native modules, on top of the kit's (`@smog/ui-native/jest-setup`).
type Module = Record<string, unknown>;

jest.mock(
  "@react-native-async-storage/async-storage",
  () =>
    jest.requireActual<Module>(
      "@react-native-async-storage/async-storage/jest/async-storage-mock"
    ).default
);
jest.mock("@react-native-community/netinfo", () =>
  jest.requireActual<Module>(
    "@react-native-community/netinfo/jest/netinfo-mock"
  )
);
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));

// Files are a Map (`mockFiles`: uri → text); sharing is recorded.
const mockFiles = new Map<string, string>();
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    create(): void {
      mockFiles.set(this.uri, "");
    }
    write(text: string): void {
      mockFiles.set(this.uri, text);
    }
  },
  mockFiles,
  Paths: { cache: { uri: "file:///cache" } },
}));
jest.mock("expo-sharing", () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
}));

// Screenshots: `mockScreenshot()` calls every listener, as the OS would.
const mockScreenshotListeners = new Set<() => void>();
jest.mock("expo-screen-capture", () => ({
  addScreenshotListener: (listener: () => void) => {
    mockScreenshotListeners.add(listener);
    return { remove: () => mockScreenshotListeners.delete(listener) };
  },
  mockScreenshot: () => {
    for (const listener of mockScreenshotListeners) {
      listener();
    }
  },
}));

// The drag list runs on Reanimated's UI thread, which Jest does not have: a
// plain FlatList stands in (drags are a device check; the row menu's move
// up/down goes through the same `onReorder` path in the screen).
jest.mock("react-native-reorderable-list", () => {
  const { FlatList } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const utils = jest.requireActual<Module>(
    "react-native-reorderable-list/src/utils"
  );
  return {
    __esModule: true,
    default: FlatList,
    reorderItems: utils.reorderItems,
    useReorderableDrag: () => () => undefined,
  };
});

// The public env Expo inlines at build time.
process.env.EXPO_PUBLIC_API_URL ??= "https://smog.test";
process.env.EXPO_PUBLIC_ENVIRONMENT ??= "dev";
process.env.EXPO_PUBLIC_SITE_HOST ??= "smog.test";
