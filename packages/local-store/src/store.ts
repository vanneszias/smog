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
  /**
   * Optional: calls `onChange` when `key` was changed elsewhere (another tab).
   * Returns the unsubscribe function.
   */
  subscribe?: (key: string, onChange: () => void) => () => void;
}

/** Migrates stored data from version N (the map key) to N + 1. */
export type Migration = (previous: unknown) => unknown;
export type Migrations = Record<number, Migration>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Version migrations. Each step only adds what its version introduced; a
 * part that is still invalid afterwards is salvaged by `loadStored`.
 */
export const MIGRATIONS: Migrations = {
  /** 1 → 2: `preferences.importDismissedFor` (empty). */
  1: (previous) => {
    const data = isRecord(previous) ? previous : {};
    const { preferences } = data;
    return {
      ...data,
      ...(isRecord(preferences)
        ? { preferences: { importDismissedFor: [], ...preferences } }
        : {}),
      version: 2,
    };
  },
};

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

interface Loaded {
  /** Raw string to back up before the first overwrite (partial failure). */
  backup?: string;
  data: GuestData;
  /** Written by a newer app version: never overwrite it. */
  readOnly?: boolean;
}

function loadStored(raw: string | null, migrations: Migrations): Loaded {
  if (raw === null) {
    return { data: defaultGuestData() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[localStore] Failed to parse stored data", error);
    return { backup: raw, data: defaultGuestData() };
  }
  const version = versionOf(parsed);
  if (version !== undefined && version > GUEST_DATA_VERSION) {
    console.error(
      `[localStore] Stored data is version ${version}, newer than ${GUEST_DATA_VERSION}: running read-only with defaults`
    );
    return { data: defaultGuestData(), readOnly: true };
  }
  let migrated: unknown;
  try {
    migrated = migrate(parsed, migrations);
  } catch (error) {
    console.error("[localStore] Failed to parse stored data", error);
    return { backup: raw, data: defaultGuestData() };
  }
  const whole = guestDataSchema.safeParse(migrated);
  if (whole.success) {
    return { data: whole.data };
  }
  // Salvage per part: only an invalid part falls back to its defaults.
  console.error(
    "[localStore] Failed to parse stored data, salvaging valid parts",
    whole.error
  );
  const defaults = defaultGuestData();
  const source = (migrated ?? {}) as Record<string, unknown>;
  const data: GuestData = { ...defaults };
  for (const part of GUEST_PARTS) {
    const candidate = guestDataSchema.safeParse({
      ...defaults,
      [part]: source[part],
    });
    if (candidate.success) {
      Object.assign(data, { [part]: candidate.data[part] });
    }
  }
  return { backup: raw, data };
}

/**
 * Creates the store. Create it once per client (in a provider or an app
 * entry), never at module scope on the server: the memory fallback would be
 * shared across requests. Without a `storage` change listener support the
 * store still re-reads the adapter before every update, so writes from
 * other tabs are not lost.
 */
export function createLocalStore(
  adapter: StorageAdapter,
  options: LocalStoreOptions = {}
): LocalStore {
  const key = options.key ?? DEFAULT_STORAGE_KEY;
  const migrations = options.migrations ?? MIGRATIONS;
  const listeners = new Set<() => void>();
  let state = defaultGuestData();
  let readOnly = false;
  let pendingBackup: string | undefined;

  const setState = (next: GuestData): void => {
    if (next === state) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  /** Re-reads the adapter and adopts what is stored (another tab may have written). */
  const sync = async (): Promise<void> => {
    try {
      const loaded = loadStored(await adapter.getItem(key), migrations);
      if (loaded.readOnly) {
        if (!readOnly) {
          readOnly = true;
          setState(loaded.data);
        }
        return;
      }
      readOnly = false;
      pendingBackup = loaded.backup ?? pendingBackup;
      if (JSON.stringify(loaded.data) !== JSON.stringify(state)) {
        setState(loaded.data);
      }
    } catch (error) {
      console.error("[localStore] Failed to read stored data", error);
    }
  };

  const ready = sync();
  let tail: Promise<void> = ready;

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const update = (fn: (draft: GuestData) => GuestData): Promise<void> =>
    enqueue(async () => {
      await sync();
      const next = fn(state);
      if (next === state) {
        return;
      }
      setState(next);
      if (readOnly) {
        console.error(
          "[localStore] Stored data is newer than this app: change kept in memory only"
        );
        return;
      }
      try {
        if (pendingBackup !== undefined) {
          await adapter.setItem(`${key}:backup`, pendingBackup);
          pendingBackup = undefined;
        }
        await adapter.setItem(key, JSON.stringify(next));
      } catch (error) {
        console.error("[localStore] Failed to persist data", error);
        throw error;
      }
    });

  // Lives as long as the store (one per client), so it is never unsubscribed.
  adapter.subscribe?.(key, () => {
    enqueue(sync);
  });

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
