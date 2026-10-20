import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useLinkToken } from "./use-link-token";

const TOKEN = "a".repeat(43);

function visit(url: string): void {
  window.history.replaceState({ key: "router" }, "", url);
}

afterEach(() => {
  cleanup();
  visit("/");
});

describe("useLinkToken (phase 9 ruling 7)", () => {
  test("reads the fragment and leaves the address alone", async () => {
    visit(`/sponsor/edit#token=${TOKEN}`);
    const { result } = renderHook(() => useLinkToken());
    await waitFor(() => expect(result.current).toBe(TOKEN));
    expect(window.location.hash).toBe(`#token=${TOKEN}`);
  });

  test("a malformed token is null once read", async () => {
    visit("/sponsor/edit#token=short");
    const { result } = renderHook(() => useLinkToken());
    await waitFor(() => expect(result.current).toBeNull());
  });

  test("an old ?token= link is moved into the fragment with replaceState", async () => {
    visit(`/sponsor/renew?token=${TOKEN}&x=1`);
    const before = window.history.length;
    const { result } = renderHook(() => useLinkToken());
    await waitFor(() => expect(result.current).toBe(TOKEN));
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe(`#token=${TOKEN}`);
    expect(window.location.href).not.toContain("?token=");
    // Replaced, not pushed; the router's history state is kept.
    expect(window.history.length).toBe(before);
    expect(window.history.state).toEqual({ key: "router" });
  });

  test("follows a changed fragment", async () => {
    visit(`/sponsor/edit#token=${TOKEN}`);
    const { result } = renderHook(() => useLinkToken());
    await waitFor(() => expect(result.current).toBe(TOKEN));
    const other = "b".repeat(43);
    visit(`/sponsor/edit#token=${other}`);
    window.dispatchEvent(new Event("hashchange"));
    await waitFor(() => expect(result.current).toBe(other));
  });

  test("the token is never written to the console", async () => {
    const seen: unknown[][] = [];
    const original = { ...console };
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      console[level] = (...args: unknown[]) => {
        seen.push(args);
      };
    }
    try {
      visit(`/sponsor/edit?token=${TOKEN}`);
      const { result } = renderHook(() => useLinkToken());
      await waitFor(() => expect(result.current).toBe(TOKEN));
    } finally {
      Object.assign(console, original);
    }
    expect(JSON.stringify(seen)).not.toContain(TOKEN);
  });
});
