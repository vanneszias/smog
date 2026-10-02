import { describe, expect, it, jest } from "@jest/globals";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { router } from "expo-router";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { shareAsync } from "expo-sharing";
import { renderApp } from "./test/harness";

// The real auth client (Better Auth, SecureStore) is never built: tests pass fakes.
jest.mock("@smog/auth/expo", () => ({ createExpoAuthClient: jest.fn() }));
jest.mock("../global.css", () => ({}));
jest.mock("nativewind", () => {
  const actual = jest.requireActual<typeof import("nativewind")>("nativewind");
  return {
    ...actual,
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: () => undefined,
      toggleColorScheme: () => undefined,
    }),
  };
});

const { mockFiles } = jest.requireMock("expo-file-system") as {
  mockFiles: Map<string, string>;
};

const EXPORT_URI = /^file:\/\/\/cache\/smog-export-\d{4}-\d{2}-\d{2}\.json$/;

const ME = {
  createdAt: 1000,
  email: "an@smog.test",
  emailVerified: true,
  id: "u-an",
  image: null,
  locale: null,
  methods: { apple: false, google: true, passkeys: 0, password: true },
  name: "An",
  role: "user",
};

const DECIDED = {
  analytics: false,
  decidedAt: 10,
  needsDecision: false,
  policyVersion: CONSENT_POLICY_VERSION,
};

const EXPORT = {
  consent: [],
  exportedAt: "2026-09-30T12:00:00.000Z",
  exportVersion: 2,
  favorites: [],
  lists: [],
  profile: {
    createdAt: "2026-09-01T12:00:00.000Z",
    email: ME.email,
    emailVerified: true,
    id: ME.id,
    image: null,
    locale: null,
    name: ME.name,
    role: "user",
  },
  signInMethods: { passkeys: [], providers: [] },
  sponsorships: [],
};

function signedInRoutes(overrides: Record<string, unknown> = {}) {
  return {
    "account/consent/get": DECIDED,
    "account/me": ME,
    "system/authConfig": { apple: false, google: true },
    ...overrides,
  };
}

/** Opens settings/account (a deep link to it would go to `/`). */
async function inAccount(): Promise<ReturnType<typeof within>> {
  await act(() => {
    router.push("/settings/account");
  });
  return within(await screen.findByTestId("account-screen"));
}

describe("consent sheet", () => {
  it("shows on first launch and Allow saves the decision on the device", async () => {
    const { clients } = await renderApp({
      guest: { consent: { analytics: null } },
    });
    const sheet = within(await screen.findByTestId("consent-banner"));
    expect(
      sheet.getByRole("header", { name: "Help improve SMOG" })
    ).toBeOnTheScreen();
    await fireEvent.press(
      sheet.getByRole("button", { name: "Allow statistics" })
    );
    await waitFor(() =>
      expect(screen.queryByTestId("consent-banner")).not.toBeOnTheScreen()
    );
    expect(clients.store.getSnapshot().consent.analytics).toBe(true);
  });

  it("waits for the guest import sheet (review I1)", async () => {
    await renderApp({
      guest: {
        consent: { analytics: null },
        favorites: ["g-hond"],
        preferences: { importDismissedFor: [], locale: "en", theme: "light" },
      },
      routes: {
        "account/consent/get": {
          analytics: null,
          decidedAt: null,
          needsDecision: true,
          policyVersion: null,
        },
        "favorites/ids": [],
      },
      signedIn: true,
    });
    expect(
      await screen.findByRole("header", { name: "Bring your data along?" })
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("consent-banner")).not.toBeOnTheScreen();
  });

  it("removes an export left behind at launch (review I3)", async () => {
    mockFiles.set("file:///cache/smog-export-2026-01-01.json", "{}");
    mockFiles.set("file:///cache/other.json", "{}");
    await renderApp();
    await screen.findByTestId("home-screen");
    expect(mockFiles.has("file:///cache/smog-export-2026-01-01.json")).toBe(
      false
    );
    expect(mockFiles.has("file:///cache/other.json")).toBe(true);
    mockFiles.clear();
  });

  it("stays closed once decided", async () => {
    await renderApp();
    await screen.findByTestId("home-screen");
    expect(screen.queryByTestId("consent-banner")).not.toBeOnTheScreen();
  });
});

describe("settings/account", () => {
  it("a guest sees a sign-in prompt, preferences and the analytics switch", async () => {
    const { clients } = await renderApp();
    const account = await inAccount();
    expect(
      account.getByRole("header", { name: "Sign in to manage your account" })
    ).toBeOnTheScreen();
    expect(account.getByRole("button", { name: "Sign in" })).toBeOnTheScreen();
    expect(account.queryByText("Profile")).not.toBeOnTheScreen();
    const toggle = account.getByRole("switch", { name: "Usage statistics" });
    await fireEvent.press(toggle);
    await waitFor(() =>
      expect(clients.store.getSnapshot().consent.analytics).toBe(true)
    );
  });

  it("signed in: profile, methods and the export through the share sheet", async () => {
    await renderApp({
      routes: signedInRoutes({ "account/export": EXPORT }),
      signedIn: true,
    });
    const account = await inAccount();
    expect(await account.findByDisplayValue("An")).toBeOnTheScreen();
    expect(account.getByDisplayValue(ME.email)).toBeOnTheScreen();
    // Google is the only provider account next to the password: removable.
    expect(account.getByText("Linked")).toBeOnTheScreen();
    expect(account.getByRole("button", { name: "Unlink" })).toBeEnabled();

    // What the share sheet gets, read while it is open.
    let shared: string | undefined;
    (shareAsync as jest.Mock).mockImplementationOnce((path: unknown) => {
      shared = mockFiles.get(path as string);
      return Promise.resolve();
    });
    await fireEvent.press(
      account.getByRole("button", { name: "Download my data" })
    );
    await waitFor(() => expect(shareAsync).toHaveBeenCalled());
    const [uri, options] = (shareAsync as jest.Mock).mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(uri).toMatch(EXPORT_URI);
    expect(options).toMatchObject({ mimeType: "application/json" });
    expect(JSON.parse(shared ?? "")).toMatchObject({
      exportVersion: 2,
      profile: { email: ME.email },
    });
    // Deleted once the sheet is done (review I3).
    await waitFor(() => expect(mockFiles.has(uri)).toBe(false));
  });

  it("a signed-in switch writes the account's consent log (review M12)", async () => {
    const sets: unknown[] = [];
    await renderApp({
      routes: signedInRoutes({
        "account/consent/set": (input: unknown) => {
          sets.push(input);
          return { ...DECIDED, analytics: true, decidedAt: 20 };
        },
      }),
      signedIn: true,
    });
    const account = await inAccount();
    await fireEvent.press(
      await account.findByRole("switch", { name: "Usage statistics" })
    );
    await waitFor(() =>
      expect(sets).toEqual([expect.objectContaining({ analytics: true })])
    );
  });

  it("signed in, the language is also the account's (review I2)", async () => {
    const updates: unknown[] = [];
    await renderApp({
      routes: signedInRoutes({
        "account/updateProfile": (input: unknown) => {
          updates.push(input);
          return { ...ME, locale: "fr" };
        },
      }),
      signedIn: true,
    });
    const account = await inAccount();
    await account.findByDisplayValue("An");
    expect(account.queryByText("Email language")).not.toBeOnTheScreen();
    expect(
      account.getByText(
        "When you're signed in, this is also the language of the emails we send you."
      )
    ).toBeOnTheScreen();
    await fireEvent.press(account.getByRole("combobox", { name: "Language" }));
    await fireEvent.press(
      await screen.findByRole("radio", { name: "Français" })
    );
    await waitFor(() => expect(updates).toEqual([{ locale: "fr" }]));
  });

  it("the last provider account cannot be unlinked", async () => {
    await renderApp({
      routes: signedInRoutes({
        "account/me": {
          ...ME,
          methods: { apple: false, google: true, passkeys: 1, password: false },
        },
      }),
      signedIn: true,
    });
    const account = await inAccount();
    expect(
      await account.findByRole("button", { name: "Unlink" })
    ).toBeDisabled();
    expect(
      account.getByText(
        "This is your only sign-in method. Add another one first."
      )
    ).toBeOnTheScreen();
  });

  it("deletes after typing DELETE and the password, then signs out and clears the device", async () => {
    const deleted: unknown[] = [];
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const { clients } = await renderApp({
      auth: { signOut },
      guest: { favorites: ["g-hond"] },
      routes: signedInRoutes({
        "account/delete": (input: unknown) => {
          deleted.push(input);
          return { deleted: true };
        },
      }),
      signedIn: true,
    });
    const account = await inAccount();
    await fireEvent.press(
      await account.findByRole("button", { name: "Delete my account" })
    );
    const confirm = screen.getAllByRole("button", {
      name: "Delete my account",
    });
    const dialogConfirm = confirm.at(-1);
    if (!dialogConfirm) {
      throw new Error("no confirm button");
    }
    expect(dialogConfirm).toBeDisabled();
    await fireEvent.changeText(
      screen.getByLabelText("Type DELETE to confirm"),
      "DELETE"
    );
    expect(dialogConfirm).toBeDisabled();
    await fireEvent.changeText(
      screen.getByLabelText("Your password"),
      "secret-password"
    );
    expect(dialogConfirm).toBeEnabled();
    await fireEvent.press(dialogConfirm);

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(deleted).toEqual([
      { confirm: "DELETE", password: "secret-password" },
    ]);
    await waitFor(() =>
      expect(clients.store.getSnapshot().favorites).toEqual([])
    );
  });

  it("clears the export files even when the sign-out after deletion fails", async () => {
    const signOut = jest.fn(() => Promise.reject(new Error("offline")));
    // The failed sign-out is logged by design; keep the run's output clean.
    const logged = jest.spyOn(console, "error").mockImplementation(() => {
      // Intentionally empty.
    });
    await renderApp({
      auth: { signOut },
      routes: signedInRoutes({ "account/delete": { deleted: true } }),
      signedIn: true,
    });
    const account = await inAccount();
    // Written after the launch sweep, as an interrupted share would leave it.
    const leftover = "file:///cache/smog-export-2026-09-30.json";
    mockFiles.set(leftover, "{}");
    await fireEvent.press(
      await account.findByRole("button", { name: "Delete my account" })
    );
    await fireEvent.changeText(
      screen.getByLabelText("Type DELETE to confirm"),
      "DELETE"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Your password"),
      "secret-password"
    );
    const confirm = screen
      .getAllByRole("button", { name: "Delete my account" })
      .at(-1);
    if (!confirm) {
      throw new Error("no confirm button");
    }
    await fireEvent.press(confirm);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(mockFiles.has(leftover)).toBe(false));
    logged.mockRestore();
  });

  it("a refused password keeps the dialog open with the reason", async () => {
    const { rpcError } =
      jest.requireActual<typeof import("./test/harness")>("./test/harness");
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    await renderApp({
      auth: { signOut },
      routes: signedInRoutes({
        "account/delete": { response: rpcError("INVALID_PASSWORD", 400) },
      }),
      signedIn: true,
    });
    const account = await inAccount();
    await fireEvent.press(
      await account.findByRole("button", { name: "Delete my account" })
    );
    await fireEvent.changeText(
      screen.getByLabelText("Type DELETE to confirm"),
      "DELETE"
    );
    await fireEvent.changeText(screen.getByLabelText("Your password"), "nope");
    const confirm = screen
      .getAllByRole("button", { name: "Delete my account" })
      .at(-1);
    if (!confirm) {
      throw new Error("no confirm button");
    }
    await fireEvent.press(confirm);
    expect(
      await screen.findByText("That password is not correct.")
    ).toBeOnTheScreen();
    expect(signOut).not.toHaveBeenCalled();
  });
});
