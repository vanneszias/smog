import { describe, expect, spyOn, test } from "bun:test";
import {
  createNativeAnalytics,
  createNativeTransport,
  nativeRouteTemplate,
  type OpenPanelClient,
  type OpenPanelFactory,
} from "./native";

describe("nativeRouteTemplate", () => {
  test("drops Expo Router groups and keeps dynamic segments as templates", () => {
    expect(nativeRouteTemplate([])).toBe("/");
    expect(nativeRouteTemplate(["(tabs)"])).toBe("/");
    expect(nativeRouteTemplate(["(tabs)", "lists"])).toBe("/lists");
    expect(nativeRouteTemplate(["lists", "[token]"])).toBe("/lists/[token]");
    expect(nativeRouteTemplate(["settings", "developer-tools"])).toBe(
      "/settings/developer-tools"
    );
  });
});

function fakeOpenPanel() {
  const created: Record<string, unknown>[] = [];
  const calls: unknown[][] = [];
  const factory: OpenPanelFactory = (options) => {
    created.push(options as unknown as Record<string, unknown>);
    const client: OpenPanelClient = {
      clear: () => {
        calls.push(["clear"]);
      },
      identify: (payload) => {
        calls.push(["identify", payload]);
      },
      screenView: (path, properties) => {
        calls.push(["screenView", path, properties]);
      },
      track: (name, properties) => {
        calls.push(["track", name, properties]);
      },
    };
    return Promise.resolve(client);
  };
  return { calls, created, factory };
}

const CONFIG = {
  apiUrl: "https://analytics.example/api",
  clientId: "native-id",
  clientSecret: "write-only-secret",
};

describe("createNativeTransport", () => {
  test("creates the OpenPanel client on the first call, not before", async () => {
    const op = fakeOpenPanel();
    const transport = createNativeTransport({
      ...CONFIG,
      allow: () => true,
      createClient: op.factory,
    });
    expect(op.created).toEqual([]);
    await transport.screen("/", "native");
    expect(op.created).toHaveLength(1);
    expect(op.created[0]).toMatchObject({
      apiUrl: CONFIG.apiUrl,
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret,
    });
    // The SDK's own filter asks the consent again before every send.
    const filter = op.created[0]?.filter as () => boolean;
    expect(filter()).toBe(true);
    expect(op.calls).toEqual([["screenView", "/", { platform: "native" }]]);
  });

  test("tracks, identifies by user id only, and clears on reset", async () => {
    const op = fakeOpenPanel();
    const transport = createNativeTransport({
      ...CONFIG,
      allow: () => true,
      createClient: op.factory,
    });
    await transport.identify("user-1", "native");
    await transport.track({
      name: "video_playback_completed",
      properties: { gesture_id: "g-1", platform: "native" },
    });
    await transport.reset();
    expect(op.calls).toEqual([
      [
        "identify",
        {
          profileId: "user-1",
          properties: { auth_mode: "authenticated", platform: "native" },
        },
      ],
      [
        "track",
        "video_playback_completed",
        { gesture_id: "g-1", platform: "native" },
      ],
      ["clear"],
    ]);
  });

  test("reset before any call creates nothing", async () => {
    const op = fakeOpenPanel();
    const transport = createNativeTransport({
      ...CONFIG,
      allow: () => true,
      createClient: op.factory,
    });
    await transport.reset();
    expect(op.created).toEqual([]);
  });

  test("without credentials it warns once and never creates a client", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    const op = fakeOpenPanel();
    const transport = createNativeTransport({
      allow: () => true,
      apiUrl: CONFIG.apiUrl,
      clientId: undefined,
      clientSecret: undefined,
      createClient: op.factory,
    });
    await transport.screen("/", "native");
    await transport.screen("/lists", "native");
    expect(op.created).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toStartWith("[analytics]");
    warn.mockRestore();
  });
});

describe("createNativeAnalytics", () => {
  test("no client before consent; clear() on withdraw", async () => {
    const op = fakeOpenPanel();
    let consent: boolean | null = null;
    const listeners = new Set<() => void>();
    const analytics = createNativeAnalytics({
      ...CONFIG,
      createClient: op.factory,
      getConsent: () => consent,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    analytics.screen("/");
    analytics.identify("user-1");
    await Promise.resolve();
    expect(op.created).toEqual([]);

    consent = true;
    for (const listener of listeners) {
      listener();
    }
    analytics.screen("/");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(op.created).toHaveLength(1);

    consent = false;
    for (const listener of listeners) {
      listener();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(op.calls.at(-1)).toEqual(["clear"]);
    const before = op.calls.length;
    analytics.screen("/lists");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(op.calls).toHaveLength(before);
  });
});
