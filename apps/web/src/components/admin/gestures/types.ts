/**
 * @fileoverview Shared types for the gesture admin table and its sub-components.
 */

/** Gesture row shape as returned by the admin API. */
export interface AdminGesture {
  _id: string;
  categoryIds: string[];
  concept: string[];
  info: string;
  isActive: boolean;
  name: string;
  playbackId: string;
}

/** Category option for the CategoriesCell dropdown. */
export interface AdminCategory {
  _id: string;
  isActive: boolean;
  name: string;
}

/** A pending field change on a single gesture. */
export interface GestureChange {
  changes: Record<string, { old: unknown; new: unknown }>;
  gesture: AdminGesture;
}
