import { jest } from "@jest/globals";

// The app's native modules, on top of the kit's (`@smog/ui-native/jest-setup`).
type Module = Record<string, unknown>;

// The mock is CommonJS (module.exports = the mock), so it is the module.
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual<Module>(
    "@react-native-async-storage/async-storage/jest/async-storage-mock"
  )
);
jest.mock("@react-native-community/netinfo", () =>
  jest.requireActual<Module>(
    "@react-native-community/netinfo/jest/netinfo-mock"
  )
);
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
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
