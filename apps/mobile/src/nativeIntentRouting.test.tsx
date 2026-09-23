import { router, Stack, Tabs } from "expo-router";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from "expo-router/testing-library";
import { Pressable, Text } from "react-native";
import { unstable_settings } from "../app/_layout";
import { redirectSystemPath } from "../app/+native-intent";

/*
 * Tailwind's directives, which Metro compiles and Jest cannot parse; see
 * `screens/rootLayout.test.tsx`.
 */
jest.mock("../global.css", () => ({}));
/*
 * The root layout calls `enableScreens()` on import, which only logs under
 * Jest (no native module); the navigators below still need the rest of the
 * package.
 */
jest.mock("react-native-screens", () => ({
  ...jest.requireActual("react-native-screens"),
  enableScreens: jest.fn(),
}));

/**
 * The app's real route shape, reduced to stand-ins: a root stack carrying the
 * root layout's own `unstable_settings`, the tab group under it, and the
 * gesture screen pushed over it, whose back control calls `router.back()`
 * exactly as `app/gestures/[id].tsx`'s "Terug" does.
 */
function launchWith(initialUrl: string): ReturnType<typeof renderRouter> {
  return renderRouter(
    {
      "+native-intent": { redirectSystemPath },
      _layout: {
        default: () => <Stack screenOptions={{ headerShown: false }} />,
        unstable_settings,
      },
      "(tabs)/_layout": () => <Tabs screenOptions={{ headerShown: false }} />,
      "(tabs)/index": () => <Text testID="home">home</Text>,
      "(tabs)/search": () => <Text testID="search">search</Text>,
      "gestures/[id]": () => (
        <Pressable onPress={() => router.back()} testID="back">
          <Text testID="gesture">gesture</Text>
        </Pressable>
      ),
    },
    { initialUrl }
  );
}

/**
 * `redirectSystemPath` as expo-router itself calls it: at launch, with the
 * URL the OS opened the app with. `nativeIntent.test.ts` pins the function,
 * and would still pass if expo-router never called it or if the path it
 * returns did not route; this would not.
 *
 * Only launch is covered. A link that arrives while the app runs goes through
 * the same function (`link/linking.js` in expo-router), but the test renderer
 * has no way to deliver one.
 */
describe("launching the app from a link", () => {
  it("opens a gesture page link on the gesture screen", () => {
    const app = launchWith("https://app.smog.vlaanderen/fr/gestures/12");

    expect(app.getPathname()).toBe("/gestures/12");
    expect(screen.getByTestId("gesture")).toBeTruthy();
  });

  it("goes back to the home tab from a gesture it was launched into", () => {
    const app = launchWith("https://app.smog.vlaanderen/nl/gestures/12");

    expect(router.canGoBack()).toBe(true);

    act(() => {
      fireEvent.press(screen.getByTestId("back"));
    });

    expect(app.getPathname()).toBe("/");
    expect(screen.getByTestId("home")).toBeTruthy();
  });

  it("opens a link to the gesture list on the search tab", () => {
    const app = launchWith("https://app.smog.vlaanderen/nl/gestures?q=hallo");

    expect(app.getPathname()).toBe("/search");
    expect(screen.getByTestId("search")).toBeTruthy();
  });

  it("still opens on the home tab when launched without a link", () => {
    const app = launchWith("/");

    expect(app.getPathname()).toBe("/");
    expect(screen.getByTestId("home")).toBeTruthy();
    expect(router.canGoBack()).toBe(false);
  });
});
