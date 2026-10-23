import { describe, expect, mock, test } from "bun:test";
import { createLocalStore, createMemoryAdapter } from "@smog/local-store";
import { LocalStoreProvider } from "@smog/local-store/react";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useNameOverlayPreference } from "./name-overlay";

function wrapperFor(store: ReturnType<typeof createLocalStore>) {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <LocalStoreProvider store={store}>{children}</LocalStoreProvider>;
  };
}

describe("useNameOverlayPreference", () => {
  test("is loaded and shown once the device store is read", async () => {
    const store = createLocalStore(createMemoryAdapter());
    const { result } = renderHook(() => useNameOverlayPreference(), {
      wrapper: wrapperFor(store),
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.shown).toBe(true);
  });

  test("a store that cannot be read still ends up loaded (shown, the default), never hiding the name for good", async () => {
    const store = createLocalStore(createMemoryAdapter());
    Object.defineProperty(store, "ready", {
      value: Promise.reject(new Error("storage blocked")),
    });
    const log = mock(() => undefined);
    const original = console.error;
    console.error = log;
    try {
      const { result } = renderHook(() => useNameOverlayPreference(), {
        wrapper: wrapperFor(store),
      });
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.shown).toBe(true);
      expect(log).toHaveBeenCalled();
    } finally {
      console.error = original;
    }
  });
});
