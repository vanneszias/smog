import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import { signUp } from "@/lib/session";
import SignUpScreen from "../../app/(auth)/sign-up";

/**
 * **Screen tests live under `src/`, never under `app/`.** Expo Router builds
 * its route table with `require.context` over the whole `app/` directory, so
 * anything placed there is bundled — and a test file drags
 * `@testing-library/react-native` in with it, which imports node's `console`
 * and fails `expo export` outright. This file started life at
 * `app/(auth)/sign-up.test.tsx` and turned CI red for exactly that reason;
 * `src/boundary.test.ts` now fails if a test file appears under `app/` again.
 */

/**
 * `expo-router`'s real module chain (`getPathFromState` → `query-string` →
 * `decode-uri-component`) ships ESM this app's `transformIgnorePatterns`
 * does not cover, so importing it for real under Jest fails at parse time
 * before a single test runs. A screen test needs none of the real router —
 * only that `Link`/`router` exist as callable stand-ins — so the whole
 * module is mocked rather than adding another package to the transform
 * allowlist for navigation this test never exercises.
 */
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: jest.fn() },
}));

jest.mock("@/lib/session");

describe("SignUpScreen", () => {
  beforeEach(() => jest.resetAllMocks());

  const submit = () => {
    fireEvent.press(screen.getByRole("button", { name: "Account aanmaken" }));
  };

  /**
   * Review Focus item 3: a `try { … } finally { … }` with no `catch` lets a
   * network failure (or any status `signUp` doesn't recognise — see
   * `session.ts`'s `ApiError("unknown", …)` fallback) escape as an
   * unhandled rejection. `finally` still resets `submitting`, so the
   * spinner stops and the screen otherwise does nothing — a silent no-op
   * indistinguishable from a rejected address.
   */
  it("shows a failure message when the request fails, rather than doing nothing", async () => {
    (signUp as jest.Mock).mockRejectedValue(new Error("network"));

    render(<SignUpScreen />);
    submit();

    await waitFor(() => {
      expect(screen.getByTestId("sign-up-error")).toBeOnTheScreen();
    });
  });

  it("does not navigate to sign-in when the request fails", async () => {
    (signUp as jest.Mock).mockRejectedValue(new Error("network"));

    render(<SignUpScreen />);
    submit();

    await waitFor(() => {
      expect(screen.getByTestId("sign-up-error")).toBeOnTheScreen();
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("still navigates to sign-in, with the neutral notice, on acceptance", async () => {
    (signUp as jest.Mock).mockResolvedValue("accepted");

    render(<SignUpScreen />);
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith({
        params: { notice: "registered" },
        pathname: "/sign-in",
      });
    });

    expect(screen.queryByTestId("sign-up-error")).toBeNull();
  });
});
