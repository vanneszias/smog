/**
 * @fileoverview Shared types for the gesture admin table and its sub-components.
 */

/** Gesture row shape as returned by the admin API. */
export interface AdminGesture {
  _id: string;
  name: string;
  info: string;
  playbackId: string;
  concept: string[];
  isActive: boolean;
  categoryIds: string[];
}

/** Category option for the CategoriesCell dropdown. */
export interface AdminCategory {
  _id: string;
  name: string;
  isActive: boolean;
}

/** A pending field change on a single gesture. */
export interface GestureChange {
  gesture: AdminGesture;
  changes: Record<string, { old: unknown; new: unknown }>;
}
