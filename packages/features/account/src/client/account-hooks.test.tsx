import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { setConsent, setPreferences, toggleFavorite } from "@smog/local-store";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  ANNA,
  EXPORT,
  fakeAuthClient,
  GUEST,
  LOADING,
  ME,
  newServer,
  newStore,
  setup,
} from "../../test/hooks-harness";
import type { AccountExport } from "../schema";
import {
  accountActionError,
  accountActionMessage,
  canUnlink,
  deleteFailureMessage,
  exportFileName,
  serializeExport,
  useAccount,
  useConsent,
  useConsentChoice,
  useDeleteAccount,
  useExport,
  usePasskeys,
  useSignInMethods,
} from "./index";

afterEach(() => {
  cleanup();
});

describe("useConsent: guest", () => {
  test("reads and writes the local store only", async () => {
    const store = await newStore();
    const { server, wrapper } = setup(store, GUEST);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      analytics: null,
      needsDecision: true,
    });

    await act(async () => {
      await result.current.set(true);
    });

    expect(result.current).toMatchObject({
      analytics: true,
      needsDecision: false,
    });
    expect(store.getSnapshot().consent.analytics).toBe(true);
    expect(server.consentCalls).toEqual([]);
  });

  test("is loading while the session loads", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const { wrapper } = setup(store, LOADING);
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current).toMatchObject({
      analytics: null,
      status: "loading",
    });
  });
});

describe("useConsentChoice", () => {
  test("resolves true when saved, false when it failed, and is idle after", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsentChoice(), { wrapper });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.choose(true);
    });
    expect(saved).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(server.consentCalls).toEqual([{ analytics: true, source: "web" }]);

    server.failConsent = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => {
      saved = await result.current.choose(false);
    });
    expect(saved).toBe(false);
    expect(result.current.busy).toBe(false);
    error.mockRestore();
  });
});

describe("useConsent: signed in", () => {
  test("reads the server log and mirrors it to the local store", async () => {
    const store = await newStore();
    await store.update(setConsent(false, 1));
    const server = newServer();
    server.consent = {
      analytics: true,
      decidedAt: 4000,
      needsDecision: false,
      policyVersion: CONSENT_POLICY_VERSION,
    };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    expect(result.current).toMatchObject({
      analytics: null,
      status: "loading",
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analytics).toBe(true);
    await waitFor(() =>
      expect(store.getSnapshot().consent).toEqual({
        analytics: true,
        decidedAt: 4000,
        mirroredFrom: "user-anna",
      })
    );
  });

  test("a yes under an older policy asks again and sends nothing meanwhile", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const server = newServer();
    server.consent = {
      analytics: true,
      decidedAt: 4000,
      needsDecision: true,
      policyVersion: "2020-01-01",
    };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      analytics: null,
      needsDecision: true,
    });
    // Not mirrored: the old yes is not a current decision.
    expect(store.getSnapshot().consent).toEqual({
      analytics: true,
      decidedAt: 1,
    });

    await act(async () => {
      await result.current.set(true);
    });
    expect(result.current).toMatchObject({
      analytics: true,
      needsDecision: false,
    });
  });

  test("set appends to the server log, then mirrors it", async () => {
    const store = await newStore();
    const { server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.set(false);
    });

    expect(server.consentCalls).toEqual([{ analytics: false, source: "web" }]);
    expect(result.current.analytics).toBe(false);
    expect(store.getSnapshot().consent).toEqual({
      analytics: false,
      decidedAt: 5001,
      mirroredFrom: "user-anna",
    });
  });

  test("a failed server read is an error and never counts as consent", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1));
    const server = { ...newServer(), failConsent: true };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.analytics).toBeNull();
  });

  test("a failed set rejects and changes nothing on the device", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    server.failConsent = true;
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      await expect(result.current.set(true)).rejects.toThrow();
    });

    expect(store.getSnapshot().consent.analytics).toBeNull();
    expect(error.mock.calls[0]?.[0]).toBe(
      "[account] Failed to save the consent decision:"
    );
    error.mockRestore();
  });
});

describe("useAccount", () => {
  test("loads the profile and updates it", async () => {
    const store = await newStore();
    const { auth, server, wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useAccount(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.me).toEqual(ME);

    await act(async () => {
      await result.current.updateProfile({ locale: "fr", name: "Anna P" });
    });

    expect(server.updateCalls).toEqual([{ locale: "fr", name: "Anna P" }]);
    // The cache update reaches the hook on the next notify tick.
    await waitFor(() =>
      expect(result.current.me).toMatchObject({ locale: "fr", name: "Anna P" })
    );
    // The session carries the name: it is read again.
    expect(auth.refetches).toBeGreaterThan(0);
  });

  test("is signedOut for a guest", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, GUEST);
    const { result } = renderHook(() => useAccount(), { wrapper });
    expect(result.current).toMatchObject({
      me: undefined,
      status: "signedOut",
    });
  });
});

describe("useExport", () => {
  test("fetches the export", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useExport(), { wrapper });

    let data: AccountExport | undefined;
    await act(async () => {
      data = await result.current.exportAccount();
    });

    expect(data).toEqual(EXPORT);
    expect(result.current.status).toBe("idle");
  });

  test("names and formats the file", () => {
    expect(exportFileName(new Date("2026-09-29T23:30:00Z"))).toBe(
      "smog-export-2026-09-29.json"
    );
    expect(JSON.parse(serializeExport(EXPORT))).toEqual(EXPORT);
    expect(serializeExport(EXPORT)).toContain("\n");
  });
});

describe("useDeleteAccount", () => {
  test("deletes, signs out and clears the device", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    await store.update(setPreferences({ theme: "dark" }));
    const { auth, queryClient, server, wrapper } = setup(store, ANNA);
    let signOuts = 0;
    const signOut = () => {
      signOuts += 1;
      return Promise.resolve();
    };
    queryClient.setQueryData(["something"], 1);
    const { result } = renderHook(() => useDeleteAccount({ signOut }), {
      wrapper,
    });

    await act(async () => {
      await result.current.deleteAccount({ confirm: "DELETE" });
    });

    expect(server.deleteCalls).toEqual([{ confirm: "DELETE" }]);
    expect(signOuts).toBe(1);
    expect(store.getSnapshot().favorites).toEqual([]);
    expect(store.getSnapshot().preferences.theme).toBe("system");
    expect(queryClient.getQueryData(["something"])).toBeUndefined();
    expect(auth.refetches).toBeGreaterThan(0);
    expect(result.current).toMatchObject({ error: null, status: "deleted" });
  });

  test("a failed sign-out still clears the device", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    const { wrapper } = setup(store, ANNA);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useDeleteAccount({ signOut: () => Promise.reject(new Error("x")) }),
      { wrapper }
    );

    await act(async () => {
      await result.current.deleteAccount({ confirm: "DELETE" });
    });

    expect(store.getSnapshot().favorites).toEqual([]);
    expect(result.current.status).toBe("deleted");
    error.mockRestore();
  });

  test("a refusal keeps everything and reports its code", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    const server = {
      ...newServer(),
      deleteFails: "SESSION_NOT_FRESH" as const,
    };
    const { wrapper } = setup(store, ANNA, server);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    let signOuts = 0;
    const { result } = renderHook(
      () =>
        useDeleteAccount({
          signOut: () => {
            signOuts += 1;
            return Promise.resolve();
          },
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(
        result.current.deleteAccount({ confirm: "DELETE" })
      ).rejects.toMatchObject({ code: "SESSION_NOT_FRESH" });
    });

    expect(signOuts).toBe(0);
    expect(store.getSnapshot().favorites).toEqual(["g-aap"]);
    expect(result.current).toMatchObject({
      error: "SESSION_NOT_FRESH",
      status: "error",
    });
    expect(error.mock.calls[0]?.[0]).toBe(
      "[account] Failed to delete the account:"
    );
    error.mockRestore();
  });
});

describe("sign-in method rules", () => {
  test("a provider can be unlinked only while another account stays", () => {
    const methods = {
      apple: false,
      google: true,
      passkeys: 2,
      password: false,
    };
    // Better Auth refuses to remove the last account (a passkey is no account).
    expect(canUnlink(methods, "google")).toBe(false);
    expect(canUnlink({ ...methods, password: true }, "google")).toBe(true);
    expect(canUnlink({ ...methods, apple: true }, "apple")).toBe(true);
    expect(canUnlink(methods, "apple")).toBe(false);
  });

  test("Better Auth errors map to what the screens say", () => {
    expect(accountActionError({ code: "SESSION_NOT_FRESH", status: 403 })).toBe(
      "SIGN_IN_AGAIN"
    );
    expect(
      accountActionError({ code: "FAILED_TO_UNLINK_LAST_ACCOUNT", status: 400 })
    ).toBe("LAST_METHOD");
    expect(accountActionError({ code: "INVALID_PASSWORD", status: 400 })).toBe(
      "INVALID_PASSWORD"
    );
    expect(accountActionError({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "PASSWORD_TOO_SHORT"
    );
    expect(accountActionError({ status: 429 })).toBe("RATE_LIMITED");
    expect(accountActionError({ code: "WHATEVER" })).toBe("UNKNOWN");
    expect(accountActionError(null)).toBe("UNKNOWN");
  });

  test("every failure has a message", () => {
    expect(accountActionMessage("LAST_METHOD")).toBe(
      "account.methods.lastMethod"
    );
    expect(accountActionMessage("SIGN_IN_AGAIN")).toBe(
      "account.errors.signInAgain"
    );
    expect(accountActionMessage("UNKNOWN")).toBe("auth.errors.generic");
    expect(deleteFailureMessage("SESSION_NOT_FRESH")).toBe(
      "account.errors.sessionNotFresh"
    );
    expect(deleteFailureMessage("UNKNOWN")).toBe("account.errors.deleteFailed");
  });
});

describe("useSignInMethods", () => {
  test("unlinks a provider by its account id and reads the profile again", async () => {
    const store = await newStore();
    const server = newServer();
    server.me = { ...ME, methods: { ...ME.methods, google: true } };
    const { wrapper } = setup(store, ANNA, server);
    const auth = fakeAuthClient([
      { id: "acc-pw", providerId: "credential" },
      { id: "acc-g", providerId: "google" },
    ]);
    const { result } = renderHook(
      () => ({
        account: useAccount(),
        methods: useSignInMethods({ client: auth.client }),
      }),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.account.me?.methods.google).toBe(true)
    );
    server.me = ME;

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.methods.unlink("google");
    });

    expect(outcome).toEqual({ ok: true });
    expect(auth.calls).toContainEqual([
      "unlinkAccount",
      { accountId: "acc-g" },
    ]);
    await waitFor(() =>
      expect(result.current.account.me?.methods.google).toBe(false)
    );
    expect(result.current.methods.pending).toBeNull();
  });

  test("a refused unlink reports why", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient([{ id: "acc-g", providerId: "google" }], {
      unlinkAccount: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT", status: 400 },
    });
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useSignInMethods({ client: auth.client }),
      { wrapper }
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.unlink("google");
    });
    expect(outcome).toEqual({ error: "LAST_METHOD", ok: false });
    error.mockRestore();
  });

  test("a provider without an account row is UNKNOWN, without a call", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient([]);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useSignInMethods({ client: auth.client }),
      { wrapper }
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.unlink("apple");
    });
    expect(outcome).toEqual({ error: "UNKNOWN", ok: false });
    expect(auth.calls.map(([name]) => name)).not.toContain("unlinkAccount");
    error.mockRestore();
  });

  test("links with the callback URLs", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient();
    const { result } = renderHook(
      () => useSignInMethods({ client: auth.client }),
      { wrapper }
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.link("google", {
        callbackURL: "/account",
        errorCallbackURL: "/account",
      });
    });
    expect(outcome).toEqual({ ok: true });
    expect(auth.calls).toContainEqual([
      "linkSocial",
      {
        callbackURL: "/account",
        errorCallbackURL: "/account",
        provider: "google",
      },
    ]);
  });

  test("changes the password and signs the other devices out", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient();
    const { result } = renderHook(
      () => useSignInMethods({ client: auth.client }),
      { wrapper }
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.changePassword({
        currentPassword: "old-password",
        newPassword: "new-password-1",
      });
    });
    expect(outcome).toEqual({ ok: true });
    expect(auth.calls).toContainEqual([
      "changePassword",
      {
        currentPassword: "old-password",
        newPassword: "new-password-1",
        revokeOtherSessions: true,
      },
    ]);
  });

  test("a wrong current password is INVALID_PASSWORD", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient([], {
      changePassword: { code: "INVALID_PASSWORD", status: 400 },
    });
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(
      () => useSignInMethods({ client: auth.client }),
      { wrapper }
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.changePassword({
        currentPassword: "nope",
        newPassword: "new-password-1",
      });
    });
    expect(outcome).toEqual({ error: "INVALID_PASSWORD", ok: false });
    error.mockRestore();
  });
});

describe("usePasskeys", () => {
  test("lists (named or not, dates in ms), removes and adds", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient();
    const { result } = renderHook(() => usePasskeys({ client: auth.client }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.passkeys).toEqual([
      { createdAt: 2000, id: "pk-1", name: "Laptop" },
      { createdAt: 3000, id: "pk-2", name: null },
    ]);

    let removed: unknown;
    await act(async () => {
      removed = await result.current.remove("pk-1");
    });
    expect(removed).toEqual({ ok: true });
    await waitFor(() =>
      expect(result.current.passkeys.map((entry) => entry.id)).toEqual(["pk-2"])
    );

    let added: unknown;
    await act(async () => {
      added = await result.current.add();
    });
    expect(added).toEqual({ ok: true });
    expect(auth.calls.map(([name]) => name)).toContain("addPasskey");
  });

  test("a refused registration (no fresh session) says sign in again", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const auth = fakeAuthClient([], {
      addPasskey: { code: "SESSION_NOT_FRESH", status: 403 },
    });
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => usePasskeys({ client: auth.client }), {
      wrapper,
    });
    let added: unknown;
    await act(async () => {
      added = await result.current.add();
    });
    expect(added).toEqual({ error: "SIGN_IN_AGAIN", ok: false });
    error.mockRestore();
  });

  test("a guest has no passkeys and makes no call", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, GUEST);
    const auth = fakeAuthClient();
    const { result } = renderHook(() => usePasskeys({ client: auth.client }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.passkeys).toEqual([]);
    expect(auth.calls).toEqual([]);
  });
});
