import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AuthStateProvider,
  type SessionHookResult,
  toAuthState,
  useAuthState,
} from "../src/react";

const user = {
  email: "ada@smog.test",
  id: "u1",
  image: null,
  name: "Ada",
  role: "admin",
};

describe("toAuthState", () => {
  it("maps a pending, empty and filled session", () => {
    expect(toAuthState({ data: null, isPending: true })).toEqual({
      status: "loading",
    });
    expect(toAuthState({ data: null, isPending: false })).toEqual({
      status: "signedOut",
    });
    const withExtra = { ...user, emailVerified: true };
    expect(
      toAuthState({ data: { user: withExtra }, isPending: false })
    ).toEqual({ status: "signedIn", user });
  });

  it("names a user without a name by their email (code and link sign-ups)", () => {
    const state = toAuthState({
      data: { user: { ...user, name: " " } },
      isPending: false,
    });
    expect(state.user?.name).toBe("ada@smog.test");
  });

  it("treats a missing or unknown role as 'user'", () => {
    const state = toAuthState({
      data: { user: { ...user, role: "admin,user" } },
      isPending: false,
    });
    expect(state.user?.role).toBe("user");
  });
});

describe("toAuthState on errors (M8)", () => {
  it("keeps the last known state when a refetch fails", () => {
    const previous = toAuthState({ data: { user }, isPending: false });
    const state = toAuthState(
      { data: null, error: new Error("offline"), isPending: false },
      previous
    );
    expect(state).toEqual({ ...previous, error: true });
  });

  it("marks an error without a known state instead of signing out silently", () => {
    expect(
      toAuthState({ data: null, error: new Error("offline"), isPending: false })
    ).toEqual({ error: true, status: "signedOut" });
  });
});

describe("AuthStateProvider", () => {
  function Status() {
    const state = useAuthState();
    return <p>{`${state.status}:${state.user?.name ?? "-"}`}</p>;
  }

  it("provides the state from the injected session hook", () => {
    const useSession = (): SessionHookResult => ({
      data: { user },
      isPending: false,
    });

    const html = renderToString(
      <AuthStateProvider useSession={useSession}>
        <Status />
      </AuthStateProvider>
    );

    expect(html).toContain("signedIn:Ada");
  });

  it("exposes refetch from the session hook", () => {
    let called = false;
    const useSession = (): SessionHookResult => ({
      data: null,
      isPending: false,
      refetch: () => {
        called = true;
      },
    });
    function Refetch() {
      useAuthState().refetch();
      return null;
    }

    renderToString(
      <AuthStateProvider useSession={useSession}>
        <Refetch />
      </AuthStateProvider>
    );

    expect(called).toBe(true);
  });

  it("throws outside the provider", () => {
    expect(() => renderToString(<Status />)).toThrow("AuthStateProvider");
  });
});
