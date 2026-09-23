import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ANALYTICS_CONSENT_KEY,
  readConsent,
  resetConsentForTests,
} from "@/lib/consent";
/** `mock`-prefixed so the `jest.mock()` factory below may reference it. */
import * as mockInsetsProbe from "@/test/insetsProbe";
import RootLayout from "../../app/_layout";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

jest.mock("expo-secure-store");
/*
 * The root `Stack` stands in for every screen: it renders the probe, which
 * sits exactly where any route would render. expo-router's own
 * `renderRouter` cannot be used here — its root pins every safe-area inset
 * to 0 under Jest, which is the one thing this suite needs to vary.
 */
jest.mock("expo-router", () => ({
  Stack: mockInsetsProbe.InsetsProbe,
  useSegments: () => [],
}));
/*
 * Tailwind's directives, which Metro compiles and Jest cannot parse; this
 * suite's `jest.setup.ts` registers the compiled CSS itself.
 */
jest.mock("../../global.css", () => ({}));
/* No native screens module under Jest; `enableScreens()` only logs that. */
jest.mock("react-native-screens", () => ({ enableScreens: jest.fn() }));

/** A phone with a notch and a home indicator. */
const metrics = {
  frame: { height: 852, width: 393, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 59 },
};

/**
 * The layout's own `SafeAreaProvider` starts from its parent's insets until
 * the native view reports real ones, which never happens under Jest.
 */
function renderApp() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RootLayout />
    </SafeAreaProvider>
  );
}

describe("the root layout's safe area", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetConsentForTests();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it("pads every screen once for the status bar and notch", async () => {
    renderApp();

    await screen.findByTestId("probe");

    expect(screen.getByTestId("navigator")).toHaveStyle({ paddingTop: 59 });
    // Spent above, so a screen inside must not pad for it a second time.
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent(/^top=0 /)
    );
  });

  it("leaves the bottom inset to the screens once consent is answered", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");

    renderApp();

    // Before the stored answer loads the banner is hidden too, so wait for
    // the load itself; only then is the bottom inset below a settled answer.
    await waitFor(() => expect(readConsent()).toBe("granted"));
    expect(screen.queryByTestId("consent-privacy")).toBeNull();
    expect(screen.getByTestId("probe")).toHaveTextContent("top=0 bottom=34");
  });

  it("hands the bottom inset to the consent banner while it shows", async () => {
    renderApp();

    expect(await screen.findByTestId("consent-privacy")).toBeOnTheScreen();
    expect(screen.getByTestId("probe")).toHaveTextContent("top=0 bottom=0");
    // The banner itself still sees the real inset: `Banner` pads by it + 16.
    const banner = screen
      .getAllByTestId("root")
      .find((element) => element.props.role === "region");
    expect(banner).toHaveStyle({ paddingBottom: 50 });
  });
});
