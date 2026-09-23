import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ANALYTICS_CONSENT_KEY,
  readConsent,
  resetConsentForTests,
} from "@/lib/consent";
import { setLocale } from "@/lib/i18n";
import { ConsentBanner } from "./ConsentBanner";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const metrics = {
  frame: { height: 800, width: 400, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

function renderBanner() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ConsentBanner />
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetConsentForTests();
  setLocale("nl");
  jest.clearAllMocks();
});

describe("ConsentBanner", () => {
  it("asks someone who has never answered", async () => {
    renderBanner();
    expect(await screen.findByText("Analytics toestaan")).toBeTruthy();
  });

  it("does not render at all before the stored answer has loaded", async () => {
    // Synchronously after mount, the store has not resolved yet.
    renderBanner();
    expect(screen.queryByText("Analytics toestaan")).toBeNull();

    // Let the pending `loadConsent` read settle under `act` before this
    // test ends — otherwise its resolution (and the `emit()` it drives)
    // fires later, outside `act`, attributed to whatever test runs next.
    await screen.findByText("Analytics toestaan");
  });

  it.each([
    "granted",
    "denied",
  ])("stays away for someone who already answered %s", async (value) => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    renderBanner();
    await waitFor(() => expect(readConsent()).toBe(value));
    expect(screen.queryByText("Analytics toestaan")).toBeNull();
  });

  it("records a grant and goes away", async () => {
    renderBanner();
    fireEvent.press(await screen.findByText("Analytics toestaan"));
    await waitFor(() => expect(readConsent()).toBe("granted"));
    expect(screen.queryByText("Analytics toestaan")).toBeNull();
  });

  it("records a refusal, never a missing answer, for 'required only'", async () => {
    renderBanner();
    fireEvent.press(await screen.findByText("Gebruiken zonder analytics"));
    await waitFor(() => expect(readConsent()).toBe("denied"));
  });

  it("opens the privacy policy in the current locale without answering", async () => {
    setLocale("fr");
    renderBanner();
    fireEvent.press(await screen.findByTestId("consent-privacy"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\/fr\/privacy$/)
    );
    expect(readConsent()).toBeNull();
  });

  /**
   * Side by side in a row, the Dutch labels
   * ("Analytics toestaan" + "Gebruiken zonder analytics", ≈470pt) overflow
   * the ≈342pt a 390pt phone leaves inside the banner's padding, pushing the
   * refusal partly off-screen. Stacked, each full width, refusing is exactly
   * as reachable as accepting at any label length.
   */
  it("stacks its two answers vertically, each full width", async () => {
    renderBanner();
    const allow = await screen.findByTestId("consent-allow");
    const refuse = screen.getByTestId("consent-required-only");
    const actions = screen.getByTestId("consent-actions");

    expect(actions).toHaveStyle({ flexDirection: "column" });
    expect(actions).not.toHaveStyle({ flexDirection: "row" });
    expect(within(actions).getByTestId("consent-allow")).toBe(allow);
    expect(within(actions).getByTestId("consent-required-only")).toBe(refuse);
    expect(allow).toHaveStyle({ width: "100%" });
    expect(refuse).toHaveStyle({ width: "100%" });
  });
});
