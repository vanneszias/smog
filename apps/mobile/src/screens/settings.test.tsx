import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useColorScheme } from "nativewind";
import { setLocale } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import SettingsScreen from "../../app/(tabs)/settings/index";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

function renderScreen() {
  return render(<SettingsScreen />, { wrapper: SessionProvider });
}

describe("the settings screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale("nl");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it("switches the app's language, live", async () => {
    renderScreen();

    fireEvent.press(await screen.findByTestId("language-fr"));

    expect(await screen.findByText("Paramètres")).toBeOnTheScreen();
  });

  it("hands the theme control straight to NativeWind's colour scheme", async () => {
    renderScreen();

    fireEvent.press(await screen.findByTestId("theme-dark"));

    await waitFor(() =>
      expect(
        screen.getByTestId("theme-dark").props.accessibilityState.selected
      ).toBe(true)
    );
    expect(
      screen.getByTestId("theme-system").props.accessibilityState.selected
    ).toBe(false);

    // The one thing this screen must not do itself: decide what "dark"
    // means. It hands the choice straight to NativeWind's own store, and
    // reading it back through the same hook is what proves that, rather
    // than this screen keeping (and possibly disagreeing with) its own copy.
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.colorScheme).toBe("dark");
  });

  it("shows no account controls while signed out", async () => {
    renderScreen();

    await screen.findByTestId("theme-system");

    expect(screen.queryByTestId("manage-account")).toBeNull();
    expect(screen.queryByTestId("sign-out")).toBeNull();
  });

  it("opens the sponsor page in the system browser, not in the app", async () => {
    renderScreen();

    fireEvent.press(await screen.findByTestId("sponsor-link"));

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      expect.stringContaining("/nl/sponsor")
    );
  });
});

describe("the settings screen, signed in", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale("nl");
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
  });

  it("offers to manage the account and to sign out", async () => {
    global.fetch = jest.fn(() =>
      json({ user: { email: "a@b.test", id: "1", role: "user" } })
    ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByTestId("manage-account")).toBeOnTheScreen();
    expect(screen.getByTestId("sign-out")).toBeOnTheScreen();
  });

  it("signs out and returns to the sign-in screen", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        json({ user: { email: "a@b.test", id: "1", role: "user" } })
      ) // useSession's own /users/me
      .mockImplementationOnce(() =>
        json({ message: "ok" })
      ) as unknown as typeof fetch; // POST /users/logout

    renderScreen();

    fireEvent.press(await screen.findByTestId("sign-out"));

    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/(auth)/sign-in")
    );
  });
});
