// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/local-store`).
export { createMemoryAdapter } from "./adapters/memory";
export * from "./mutators";
export {
  defaultGuestData,
  GUEST_DATA_VERSION,
  GUEST_PARTS,
  type GuestData,
  type GuestPart,
  guestDataSchema,
  type LocalList,
  localListSchema,
} from "./schema";
export {
  createLocalStore,
  DEFAULT_STORAGE_KEY,
  type LocalStore,
  type LocalStoreOptions,
  MIGRATIONS,
  type Migration,
  type Migrations,
  type StorageAdapter,
} from "./store";
