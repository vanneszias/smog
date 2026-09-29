/**
 * @fileoverview @smog/types — Shared domain types for the SMOG monorepo
 *
 * Import from this package instead of defining local interfaces:
 *
 * @example
 * import type { Gesture, Sponsorship, User } from "@smog/types";
 */

export type {
  AdminFilter,
  AdminGestureRow,
  AdminSponsorshipRow,
  DataTableBaseProps,
  DataTableColumnBase,
  SponsorshipStatusFilter,
} from "./admin";
export type {
  ApiError,
  ApiErrorCode,
  PaginatedResponse,
  PaginationParams,
  SyncResult,
  SyncStatus,
} from "./api";
export type {
  DatabaseCategory,
  DatabaseGesture,
  DatabaseStats,
  SyncMetadata,
  TableColumnInfo,
} from "./database";
// Core domain types
export type {
  Category,
  Gesture,
  GestureWithSponsorship,
  GestureWithSponsorshipStatus,
  SearchFilters,
  SearchResult,
} from "./gestures";
export type {
  CreateSponsorshipInput,
  OverlayConfig,
  Sponsorship,
  SponsorshipPricing,
  SponsorshipStatus,
  SponsorshipWithGesture,
} from "./sponsorships";
export { DEFAULT_OVERLAY_CONFIG } from "./sponsorships";
export type {
  AuthContextType,
  AuthStatus,
  FavoritesContextType,
  User,
} from "./users";

// Theme types (kept inline — UI-only, no external dependencies)
export interface Theme {
  background: string;
  border: string;
  card: string;
  primary: string;
  secondary: string;
  statusBar: "light" | "dark";
  text: string;
  textLight: string;
}

export interface ThemeContextType {
  setTheme: (theme: Theme) => void;
  theme: Theme;
  toggleTheme: () => void;
}

// Presets (overlay configuration presets)
export * from "./presets";
