// biome-ignore-all lint/performance/noBarrelFile: the `@smog/video/testing` entry point (tests only).
import type { MuxKv } from "../upload-state";

export {
  createFakeMux,
  FAKE_MUX_TOKEN,
  type FakeAsset,
  type FakeMux,
  type FakeMuxOptions,
  type FakeUpload,
  signMuxWebhook,
} from "./fake-mux";

export interface MemoryKv extends MuxKv {
  size: () => number;
  /** The `expirationTtl` a key was last written with. */
  ttl: (key: string) => number | undefined;
}

/** A KV namespace in memory, for the webhook handler's tests. */
export function createMemoryKv(): MemoryKv {
  const values = new Map<string, { ttl: number | undefined; value: string }>();
  return {
    delete: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
    get: (key) => Promise.resolve(values.get(key)?.value ?? null),
    put: (key, value, options) => {
      values.set(key, { ttl: options?.expirationTtl, value });
      return Promise.resolve();
    },
    size: () => values.size,
    ttl: (key) => values.get(key)?.ttl,
  };
}
