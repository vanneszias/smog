import {
  defaultGuestData,
  GUEST_DATA_VERSION,
  GUEST_PARTS,
  type GuestData,
  type GuestPart,
  guestDataSchema,
} from "./schema";

export const DEFAULT_STORAGE_KEY = "smog:guest:v1";

/** Async string key-value storage: localStorage, AsyncStorage or memory. */
export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
}

/** Migrates stored data from version N (the map key) to N + 1. */
export type Migration = (previous: unknown) => unknown;
export type Migrations = Record<number, Migration>;

/** Version migrations. Version 1 is the first, so there are none yet. */
export const MIGRATIONS: Migrations = {};

export interface LocalStoreOptions {
  key?: string;
  migrations?: Migrations;
}

export interface LocalStore {
  getSnapshot: () => GuestData;
  /** Resolves once the adapter has been read. It never rejects. */
  readonly ready: Promise<void>;
  /** Clears the given parts (everything when omitted). */
  reset: (parts?: readonly GuestPart[]) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  /**
   * Applies `fn` to the current data. Updates run one after another, so
   * two quick updates both persist. Rejects if `fn` throws (the data is
   * unchanged) or if writing fails (the in-memory data is kept).
   */
  update: (fn: (draft: GuestData) => GuestData) => Promise<void>;
}

function versionOf(value: unknown): number | undefined {
  if (typeof value === "object" && value !== null && "version" in value) {
    const { version } = value as { version: unknown };
    return typeof version === "number" ? version : undefined;
  }
}

function migrate(raw: unknown, migrations: Migrations): unknown {
  let current = raw;
  let version = versionOf(current);
  if (version === undefined || version > GUEST_DATA_VERSION) {
    throw new Error("Unsupported stored version");
  }
  while (version < GUEST_DATA_VERSION) {
    const step = migrations[version];
    if (!step) {
      throw new Error(`No migration from version ${version}`);
    }
    current = step(current);
    const next = versionOf(current);
    if (next === undefined || next <= version) {
      throw new Error(`Migration from version ${version} did not advance`);
    }
    version = next;
  }
  return current;
}

function parseStored(raw: string, migrations: Migrations): GuestData | null {
  try {
    return guestDataSchema.parse(migrate(JSON.parse(raw), migrations));
  } catch (error) {
    console.error("[localStore] Failed to parse stored data", error);
    return null;
  }
}

export function createLocalStore(
  adapter: StorageAdapter,
  options: LocalStoreOptions = {}
): LocalStore {
  const key = options.key ?? DEFAULT_STORAGE_KEY;
  const migrations = options.migrations ?? MIGRATIONS;
  const listeners = new Set<() => void>();
  let state = defaultGuestData();

  const setState = (next: GuestData): void => {
    if (next === state) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const ready = (async (): Promise<void> => {
    try {
      const raw = await adapter.getItem(key);
      if (raw !== null) {
        setState(parseStored(raw, migrations) ?? defaultGuestData());
      }
    } catch (error) {
      console.error("[localStore] Failed to read stored data", error);
    }
  })();

  let tail: Promise<void> = ready;

  const update = (fn: (draft: GuestData) => GuestData): Promise<void> => {
    const run = tail.then(async () => {
      const next = fn(state);
      if (next === state) {
        return;
      }
      setState(next);
      try {
        await adapter.setItem(key, JSON.stringify(next));
      } catch (error) {
        console.error("[localStore] Failed to persist data", error);
        throw error;
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    getSnapshot: () => state,
    ready,
    reset(parts) {
      const selected = new Set<GuestPart>(parts ?? GUEST_PARTS);
      return update((draft) => {
        const defaults = defaultGuestData();
        const next: GuestData = { ...draft };
        for (const part of selected) {
          Object.assign(next, { [part]: defaults[part] });
        }
        return next;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
  };
}
