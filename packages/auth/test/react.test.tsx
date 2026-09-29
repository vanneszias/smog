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

  it("treats a missing or unknown role as 'user'", () => {
    const state = toAuthState({
      data: { user: { ...user, role: "admin,user" } },
      isPending: false,
    });
    expect(state.user?.role).toBe("user");
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

  it("throws outside the provider", () => {
    expect(() => renderToString(<Status />)).toThrow("AuthStateProvider");
  });
});
