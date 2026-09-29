import { jest } from "@jest/globals";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { act, create } from "react-test-renderer";
import RootLayout from "../../app/_layout";
import { useAuth } from "../../context/AuthProvider";

jest.mock("expo-router", () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: jest.fn(),
  useRootNavigationState: jest.fn(),
  useRouter: jest.fn(),
}));
jest.mock("expo-font", () => ({ useFonts: () => [true] }));
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }) => children,
}));
jest.mock("../../context/AppProviders", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
jest.mock("../../context/AuthProvider", () => ({ useAuth: jest.fn() }));
jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ theme: {} }),
}));
jest.mock("../../context/TranslationContext", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../components/AnalyticsConsentPrompt", () => ({
  AnalyticsConsentPrompt: () => null,
}));
jest.mock("../../components/lists/ListPickerBottomSheet", () => ({
  ListPickerBottomSheet: () => null,
}));
jest.mock("../../lib/openpanel", () => ({
  initializeOpenPanel: () => Promise.resolve(),
  subscribeAnalyticsConsent: () => () => undefined,
  getAnalyticsConsent: () => null,
}));
jest.mock("../../utils/i18n", () => ({}));
jest.mock("../../utils/logger", () => ({ log: jest.fn() }));

const replace = jest.fn();
let root;

beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue({ replace });
  useRootNavigationState.mockReturnValue({ key: "root" });
  useAuth.mockReturnValue({ isLoading: true, authMode: "loading" });
});

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
});

async function renderLayout() {
  await act(async () => {
    if (root) {
      root.update(<RootLayout />);
    } else {
      root = create(<RootLayout />);
    }
    await Promise.resolve();
  });
}

it.each([
  ["authenticated", "/gestures/gesture-123"],
  ["guest", "/gestures/gesture-123"],
  ["guest", "/lists/list-123"],
  ["authenticated", "/"],
  ["guest", "/auth-callback"],
])("preserves %s cold-start destination %s after session restoration", async (authMode, pathname) => {
  usePathname.mockReturnValue(pathname);
  await renderLayout();
  expect(replace).not.toHaveBeenCalled();

  useAuth.mockReturnValue({
    isLoading: false,
    authMode,
    isAuthenticated: authMode === "authenticated",
    isGuest: authMode === "guest",
  });
  await renderLayout();
  expect(replace).not.toHaveBeenCalled();

  usePathname.mockReturnValue("/gestures/another-gesture");
  await renderLayout();
  expect(replace).not.toHaveBeenCalled();
});

it("waits for navigation readiness before redirecting a restored guest from welcome", async () => {
  usePathname.mockReturnValue("/welcome");
  useAuth.mockReturnValue({
    isLoading: false,
    isGuest: true,
    authMode: "guest",
  });
  useRootNavigationState.mockReturnValue(undefined);
  await renderLayout();
  expect(replace).not.toHaveBeenCalled();

  useRootNavigationState.mockReturnValue({ key: "root" });
  await renderLayout();
  expect(replace).toHaveBeenCalledWith("/(tabs)");
});

it("still sends users without a session to welcome", async () => {
  usePathname.mockReturnValue("/gestures/gesture-123");
  await renderLayout();
  useAuth.mockReturnValue({ isLoading: false, authMode: "unauthenticated" });
  await renderLayout();
  expect(replace).toHaveBeenCalledWith("/welcome");
});

it("anchors deep-linked detail screens on the home tabs", () => {
  const { unstable_settings } = require("../../app/_layout");
  expect(unstable_settings).toEqual({ initialRouteName: "(tabs)" });
});
