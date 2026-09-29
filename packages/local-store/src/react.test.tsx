import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { createMemoryAdapter } from "./adapters/memory";
import { LocalStoreProvider, useLocalStore } from "./react";
import { defaultGuestData } from "./schema";
import { createLocalStore, DEFAULT_STORAGE_KEY } from "./store";

function Count() {
  const count = useLocalStore((d) => d.favorites.length);
  return <span>{count}</span>;
}

describe("react binding", () => {
  test("server-renders the defaults, whatever the store holds", async () => {
    const store = createLocalStore(
      createMemoryAdapter({
        [DEFAULT_STORAGE_KEY]: JSON.stringify({
          ...defaultGuestData(),
          favorites: ["a", "b"],
        }),
      })
    );
    await store.ready;
    expect(store.getSnapshot().favorites).toHaveLength(2);
    const html = renderToString(
      <LocalStoreProvider store={store}>
        <Count />
      </LocalStoreProvider>
    );
    expect(html).toContain("<span>0</span>");
  });

  test("throws without a provider", () => {
    expect(() => renderToString(<Count />)).toThrow();
  });
});
