import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SessionProvider } from "@/lib/session";
import ListsScreen from "../../app/(tabs)/lists/index";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

/** A signed-in session: `SessionProvider`'s own `/users/me` resolves. */
function signIn() {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
}

function renderScreen() {
  return render(<ListsScreen />, { wrapper: SessionProvider });
}

describe("the lists screen, signed out", () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("prompts sign-in rather than showing an empty lists screen", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByTestId("lists-signed-out")).toBeOnTheScreen();
    // Lists are account-only — `lib/guest.ts` keeps no local list state, so
    // nothing here should ever ask the network for "my lists" while signed
    // out.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the lists screen, signed in", () => {
  beforeEach(() => {
    signIn();
  });

  it("shows the account's lists", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        json({ user: { email: "a@b.test", id: "1", role: "user" } })
      ) // SessionProvider's own /users/me
      .mockImplementationOnce(() =>
        json({
          docs: [
            {
              id: 1,
              items: [{ gesture: 9 }],
              name: "Verjaardag",
              visibility: "private",
            },
          ],
        })
      ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText("Verjaardag")).toBeOnTheScreen();
  });

  it("shows an empty state when the account has no lists yet", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        json({ user: { email: "a@b.test", id: "1", role: "user" } })
      )
      .mockImplementationOnce(() =>
        json({ docs: [] })
      ) as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByText(/nog geen lijsten/i)).toBeOnTheScreen();
  });

  it("creates a list and navigates to it", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() =>
        json({ user: { email: "a@b.test", id: "1", role: "user" } })
      )
      .mockImplementationOnce(() => json({ docs: [] }))
      .mockImplementationOnce(() =>
        json({ id: "9", status: "created" })
      ) as unknown as typeof fetch;

    renderScreen();

    await screen.findByTestId("new-list-name");

    fireEvent.changeText(screen.getByTestId("new-list-name"), "Verjaardag");
    fireEvent.press(screen.getByTestId("create-list"));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/(tabs)/lists/9")
    );
  });
});
