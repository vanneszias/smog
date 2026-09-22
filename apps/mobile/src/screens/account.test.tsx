import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SessionProvider } from "@/lib/session";
import AccountScreen from "../../app/(tabs)/settings/account";

/**
 * Screen tests live under `src/`, never under `app/` — see
 * `src/boundary.test.ts`.
 */

/**
 * The `jest.fn()`s live *inside* the factory, not in an outer "mock"-prefixed
 * variable this file then closes over. `AccountScreen`'s own import of
 * `expo-router` is hoisted above this file's other top-level statements
 * (Babel hoists every `import`, and `jest.mock` calls above those), so an
 * outer `const mockReplace = jest.fn()` would still be in its temporal dead
 * zone — compiled by babel-plugin-jest-hoist to an uninitialised `var` —
 * the first time something requires "expo-router", and the factory below
 * would capture that `undefined` into the mock object forever (module
 * factories run once; the result is cached). Confirmed by a throwaway run:
 * `router.replace` came back `undefined` at call time with that shape.
 * `router.push`/`router.replace` are read back through the `import` above
 * instead, the same pattern `lists.test.tsx` and `favorites.test.tsx` use.
 */
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("expo-secure-store");

const EMAIL = "person@example.test";
const USER_ME = { user: { email: EMAIL, id: "1", role: "user" } };

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

function signIn() {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("t");
}

function renderScreen() {
  return render(<AccountScreen />, { wrapper: SessionProvider });
}

describe("the account screen, signed out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("asks to sign in rather than showing the account form", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    renderScreen();

    expect(await screen.findByTestId("account-signed-out")).toBeOnTheScreen();
  });
});

describe("delete account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn();
  });

  /**
   * The pair this whole screen exists for. A delete that fires on one press
   * is one-tap data loss; a delete that never asks for the confirmation the
   * server itself demands is a client that cannot be told "no" by anyone
   * who mistypes.
   */
  it("does not delete on the first press", async () => {
    global.fetch = jest.fn(() => json(USER_ME)) as unknown as typeof fetch;
    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );

    /*
     * Waits for the confirmation panel to actually appear before checking
     * what the press did *not* do. Without this, the assertion below could
     * pass for the wrong reason — a network call still pending on a
     * microtask this synchronous check runs ahead of — rather than because
     * the screen genuinely never made one. `confirm-email` only renders
     * once `confirming` is true, so finding it also proves the state update
     * from the press has fully flushed.
     */
    await screen.findByTestId("confirm-email");

    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/mobile/account/delete"),
      expect.anything()
    );
  });

  it("asks to type the account's own email address before deleting", async () => {
    global.fetch = jest.fn(() => json(USER_ME)) as unknown as typeof fetch;
    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );

    // Not `/e-mail/i`: `ChangeEmailCard`'s own "new email address" field also
    // matches that, on the very same screen — this one is the confirmation
    // field specifically, so its label says "to confirm".
    expect(await screen.findByLabelText(/bevestigen/i)).toBeOnTheScreen();
  });

  it("keeps the confirm button disabled until the typed address matches", async () => {
    global.fetch = jest.fn(() => json(USER_ME)) as unknown as typeof fetch;
    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );

    const confirmField = await screen.findByTestId("confirm-email");
    const confirmButton = screen.getByTestId("confirm-delete");

    expect(confirmButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(confirmField, "wrong@example.test");
    expect(confirmButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(confirmField, EMAIL);
    expect(confirmButton.props.accessibilityState.disabled).toBe(false);
  });

  it("deletes once the typed address matches, and signs out locally", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME)) // useSession's /users/me
      .mockImplementationOnce(() =>
        json({ status: "deleted" })
      ) as unknown as typeof fetch; // POST /mobile/account/delete

    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );
    fireEvent.changeText(await screen.findByTestId("confirm-email"), EMAIL);
    fireEvent.press(screen.getByTestId("confirm-delete"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/mobile/account/delete"),
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        expect.objectContaining({ params: { notice: "deleted" } })
      )
    );
  });

  it("reports a mismatch without signing out, on a refusal from the server", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        json({ status: "invalid" }, 400)
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );
    // The confirm button only enables once the field matches the account's
    // own address; this exercises the server refusing anyway.
    fireEvent.changeText(await screen.findByTestId("confirm-email"), EMAIL);
    fireEvent.press(screen.getByTestId("confirm-delete"));

    expect(await screen.findByTestId("delete-error")).toBeOnTheScreen();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows an error rather than nothing when the request fails outright", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        Promise.reject(new TypeError("offline"))
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.press(
      await screen.findByRole("button", { name: /account verwijderen/i })
    );
    fireEvent.changeText(await screen.findByTestId("confirm-email"), EMAIL);
    fireEvent.press(screen.getByTestId("confirm-delete"));

    expect(await screen.findByTestId("delete-error")).toBeOnTheScreen();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe("change password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn();
  });

  it("sends the current and new password, and signs out once changed", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        json({ status: "changed" })
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.changeText(
      await screen.findByTestId("current-password"),
      "old-password"
    );
    fireEvent.changeText(
      screen.getByTestId("new-password"),
      "a-much-better-password-123"
    );
    fireEvent.press(screen.getByTestId("submit-password"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/mobile/account/password"),
        expect.objectContaining({
          body: JSON.stringify({
            current: "old-password",
            next: "a-much-better-password-123",
          }),
          method: "POST",
        })
      )
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { notice: "password-changed" },
        })
      )
    );
  });

  it("shows an error rather than nothing when the request fails outright", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        Promise.reject(new TypeError("offline"))
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.changeText(
      await screen.findByTestId("current-password"),
      "old-password"
    );
    fireEvent.changeText(screen.getByTestId("new-password"), "new-password-1");
    fireEvent.press(screen.getByTestId("submit-password"));

    expect(await screen.findByTestId("password-error")).toBeOnTheScreen();
  });
});

describe("change email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn();
  });

  it("shows the check-your-email notice once the change is pending", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        json({ status: "pending" })
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.changeText(
      await screen.findByTestId("email-current-password"),
      "current-password"
    );
    fireEvent.changeText(
      screen.getByTestId("new-email"),
      "new-address@example.test"
    );
    fireEvent.press(screen.getByTestId("submit-email"));

    expect(await screen.findByTestId("email-pending")).toBeOnTheScreen();
    // The session is untouched by a pending change.
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("shows an error rather than nothing when the request fails outright", async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => json(USER_ME))
      .mockImplementationOnce(() =>
        Promise.reject(new TypeError("offline"))
      ) as unknown as typeof fetch;

    renderScreen();

    fireEvent.changeText(
      await screen.findByTestId("email-current-password"),
      "current-password"
    );
    fireEvent.changeText(
      screen.getByTestId("new-email"),
      "new-address@example.test"
    );
    fireEvent.press(screen.getByTestId("submit-email"));

    expect(await screen.findByTestId("email-error")).toBeOnTheScreen();
  });
});
