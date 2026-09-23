import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { redirectSystemPath } from "../app/+native-intent";

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
function launchWith(initialUrl: string): ReturnType<typeof renderRouter> {
  return renderRouter(
    {
      "+native-intent": { redirectSystemPath },
      "gestures/[id]": () => <Text testID="gesture">gesture</Text>,
      index: () => <Text>home</Text>,
    },
    { initialUrl }
  );
}

describe("launching the app from a link", () => {
  it("opens a gesture page link on the gesture screen", () => {
    const app = launchWith("https://app.smog.vlaanderen/fr/gestures/12");

    expect(app.getPathname()).toBe("/gestures/12");
    expect(screen.getByTestId("gesture")).toBeTruthy();
  });
});
