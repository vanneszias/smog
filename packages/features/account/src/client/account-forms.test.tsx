import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { setConsent, toggleFavorite } from "@smog/local-store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  ANNA,
  fakeAuthClient,
  GUEST,
  ME,
  newServer,
  newStore,
  setup,
} from "../../test/hooks-harness";
import {
  useAccount,
  useActionFeedback,
  useChangePasswordForm,
  useConsent,
  useConsentPrompt,
  useDeleteAccount,
  useDeleteAccountForm,
  useGuestImport,
  useProfileForm,
  useSignInMethods,
} from "./index";

afterEach(() => {
  cleanup();
});

function quiet() {
  return spyOn(console, "error").mockImplementation(() => undefined);
}

describe("consent after sign-in (review I1)", () => {
  test("a device choice reaches an undecided account without the import sheet", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 1234));
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });

    await waitFor(() =>
      expect(server.importCalls).toEqual([
        {
          consent: { analytics: true, decidedAt: 1234 },
          favorites: [],
          lists: [],
        },
      ])
    );
    // Never asked again: the device's choice is on its way to the account.
    expect(result.current.needsDecision).toBe(false);
    await waitFor(() => expect(result.current.analytics).toBe(true));
    expect(result.current.needsDecision).toBe(false);
  });

  test("with favorites on the device only the consent goes; the favorites wait for the sheet", async () => {
    const store = await newStore();
    await store.update(setConsent(false, 99));
    await store.update(toggleFavorite("g-aap"));
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(server.importCalls).toHaveLength(1));
    expect(server.importCalls[0]).toMatchObject({ favorites: [], lists: [] });
    expect(store.getSnapshot().favorites).toEqual(["g-aap"]);
  });

  test("an account that decided keeps its decision", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 5));
    const server = newServer();
    server.consent = {
      analytics: false,
      decidedAt: 10,
      needsDecision: false,
      policyVersion: CONSENT_POLICY_VERSION,
    };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.analytics).toBe(false);
    expect(server.importCalls).toEqual([]);
  });

  test("a yes under an older policy is asked again, never carried", async () => {
    const store = await newStore();
    await store.update(setConsent(true, 5));
    const server = newServer();
    server.consent = {
      analytics: true,
      decidedAt: 10,
      needsDecision: true,
      policyVersion: "2000-01-01",
    };
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useConsent(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.needsDecision).toBe(true);
    expect(server.importCalls).toEqual([]);
  });
});

describe("useConsentPrompt", () => {
  test("a guest's first visit: open, and Allow closes it", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, GUEST);
    const { result } = renderHook(() => useConsentPrompt(), { wrapper });
    await waitFor(() => expect(result.current.open).toBe(true));
    await act(async () => {
      await result.current.allow();
    });
    expect(result.current.open).toBe(false);
    expect(store.getSnapshot().consent.analytics).toBe(true);
  });

  test("waits while the import sheet is offered, then asks", async () => {
    const store = await newStore();
    await store.update(toggleFavorite("g-aap"));
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(
      () => ({ guest: useGuestImport(), prompt: useConsentPrompt() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.guest.pending).not.toBeNull());
    expect(result.current.prompt.open).toBe(false);
    await act(async () => {
      await result.current.guest.dismiss();
    });
    await waitFor(() => expect(result.current.prompt.open).toBe(true));
  });

  test("a failed save calls onSaveFailed and stays open", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    let failures = 0;
    const { result } = renderHook(
      () =>
        useConsentPrompt({
          onSaveFailed: () => {
            failures += 1;
          },
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.open).toBe(true));
    server.failConsent = true;
    const error = quiet();
    await act(async () => {
      await result.current.decline();
    });
    expect(failures).toBe(1);
    error.mockRestore();
  });
});

describe("useActionFeedback", () => {
  test("success, a failure's words, and 'sign in again'", async () => {
    const store = await newStore();
    const { wrapper } = setup(store, ANNA);
    const { result } = renderHook(() => useActionFeedback(), { wrapper });
    expect(result.current({ ok: true }, "Done")).toEqual({
      signInAgain: false,
      title: "Done",
      variant: "success",
    });
    expect(
      result.current({ error: "SIGN_IN_AGAIN", ok: false }, "Done")
    ).toEqual({
      signInAgain: true,
      title: "For your security, sign in again to do this.",
      variant: "danger",
    });
    expect(
      result.current({ error: "PASSWORD_TOO_SHORT", ok: false }, "")
    ).toMatchObject({ title: expect.stringContaining("at least") });
  });
});

describe("useChangePasswordForm", () => {
  function render(
    failures: Record<string, { code?: string; status?: number }> = {}
  ) {
    return newStore().then((store) => {
      const { wrapper } = setup(store, ANNA);
      const auth = fakeAuthClient([], failures);
      const hook = renderHook(
        () => useChangePasswordForm(useSignInMethods({ client: auth.client })),
        { wrapper }
      );
      return { auth, hook };
    });
  }

  test("checks the fields before calling", async () => {
    const { auth, hook } = await render();
    let feedback: unknown;
    await act(async () => {
      feedback = await hook.result.current.submit();
    });
    expect(feedback).toBeNull();
    expect(hook.result.current.errorFor("current")).toBe(
      "Enter your password."
    );
    act(() => {
      hook.result.current.setCurrent("old-password");
      hook.result.current.setNext("new-password-1");
      hook.result.current.setConfirm("other-password");
    });
    await act(async () => {
      feedback = await hook.result.current.submit();
    });
    expect(hook.result.current.errorFor("confirm")).toBe(
      "The passwords don't match."
    );
    expect(hook.result.current.errorFor("current")).toBeUndefined();
    expect(auth.calls).toEqual([]);
  });

  test("a wrong current password is an error on that field", async () => {
    const error = quiet();
    const { hook } = await render({
      changePassword: { code: "INVALID_PASSWORD", status: 400 },
    });
    act(() => {
      hook.result.current.setCurrent("nope-nope");
      hook.result.current.setNext("new-password-1");
      hook.result.current.setConfirm("new-password-1");
    });
    let feedback: unknown;
    await act(async () => {
      feedback = await hook.result.current.submit();
    });
    expect(feedback).toBeNull();
    expect(hook.result.current.errorFor("current")).toBe(
      "That password is not correct."
    );
    error.mockRestore();
  });

  test("a change clears the form and says so", async () => {
    const { auth, hook } = await render();
    act(() => {
      hook.result.current.setCurrent("old-password");
      hook.result.current.setNext("new-password-1");
      hook.result.current.setConfirm("new-password-1");
    });
    let feedback: unknown;
    await act(async () => {
      feedback = await hook.result.current.submit();
    });
    expect(feedback).toMatchObject({ variant: "success" });
    expect(auth.calls.map(([name]) => name)).toContain("changePassword");
    expect(hook.result.current.values).toEqual({
      confirm: "",
      current: "",
      next: "",
    });
  });
});

describe("useProfileForm", () => {
  test("starts from the profile, refuses a blank name, saves a new one", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(() => useProfileForm(useAccount()), {
      wrapper,
    });
    await waitFor(() => expect(result.current.name).toBe(ME.name));
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setName("   "));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(false);
    expect(result.current.error).toBe("Enter your name.");
    expect(server.updateCalls).toEqual([]);

    act(() => result.current.setName("Anna B"));
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(true);
    expect(result.current.error).toBeNull();
    expect(server.updateCalls).toEqual([{ name: "Anna B" }]);
  });
});

describe("useDeleteAccountForm", () => {
  test("needs DELETE and the password; a refusal stays open with its words", async () => {
    const store = await newStore();
    const server = {
      ...newServer(),
      deleteFails: "SESSION_NOT_FRESH" as const,
    };
    const { wrapper } = setup(store, ANNA, server);
    const error = quiet();
    const { result } = renderHook(
      () =>
        useDeleteAccountForm({
          needsPassword: true,
          signOut: () => Promise.resolve(),
        }),
      { wrapper }
    );
    act(() => result.current.onOpenChange(true));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setTyped("DELETE"));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setPassword("secret"));
    expect(result.current.ready).toBe(true);

    let deleted: boolean | undefined;
    await act(async () => {
      deleted = await result.current.confirm();
    });
    expect(deleted).toBe(false);
    expect(server.deleteCalls).toEqual([
      { confirm: "DELETE", password: "secret" },
    ]);
    expect(result.current.open).toBe(true);
    expect(result.current.failure).toBe("SESSION_NOT_FRESH");
    expect(result.current.failureMessage).toBe(
      "Sign in again to delete your account."
    );

    act(() => result.current.onOpenChange(false));
    expect(result.current.open).toBe(false);
    expect(result.current.typed).toBe("");
    expect(result.current.password).toBe("");
    error.mockRestore();
  });

  test("an account without a password only types DELETE", async () => {
    const store = await newStore();
    const server = newServer();
    const { wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(
      () =>
        useDeleteAccountForm({
          needsPassword: false,
          signOut: () => Promise.resolve(),
        }),
      { wrapper }
    );
    act(() => result.current.setTyped(" delete "));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setTyped("DELETE"));
    expect(result.current.ready).toBe(true);
    let deleted: boolean | undefined;
    await act(async () => {
      deleted = await result.current.confirm();
    });
    expect(deleted).toBe(true);
    expect(server.deleteCalls).toEqual([{ confirm: "DELETE" }]);
  });
});

describe("useDeleteAccount clears the cache once signed out (review M1)", () => {
  test("no query or mutation is left, mounted user queries included", async () => {
    const store = await newStore();
    const server = newServer();
    const { auth, queryClient, wrapper } = setup(store, ANNA, server);
    const { result } = renderHook(
      () => {
        const account = useAccount();
        const mutation = useMutation({ mutationFn: () => Promise.resolve(1) });
        const other = useQuery({
          queryFn: () => Promise.resolve(1),
          queryKey: ["public"],
        });
        return {
          account,
          deleting: useDeleteAccount({
            signOut: () => {
              auth.current = GUEST;
              return Promise.resolve();
            },
          }),
          mutation,
          other,
        };
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.account.status).toBe("ready"));
    await act(async () => {
      await result.current.mutation.mutateAsync();
    });
    const reads = server.meReads;
    await act(async () => {
      await result.current.deleting.deleteAccount({ confirm: "DELETE" });
    });
    // The mounted `account.me` never refetched for the deleted user.
    expect(server.meReads).toBe(reads);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => JSON.stringify(query.queryKey).includes("user-anna"))
    ).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(auth.refetches).toBeGreaterThan(0);
    expect(result.current.deleting.status).toBe("deleted");
  });
});
