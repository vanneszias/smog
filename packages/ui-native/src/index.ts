/**
 * `@smog/ui-native` — the React Native counterpart of `@smog/ui-web`.
 *
 * Convention: every component here roots at `testID="root"` by default,
 * overridable by a caller passing its own `testID`. `contract.test.tsx`
 * relies on this to grab each component's outermost element without a
 * per-component special case, so a new component that skips it fails that
 * suite immediately rather than silently.
 */
export { Avatar, type AvatarProps, avatarVariants } from "./components/Avatar";
export { Badge, type BadgeProps, badgeVariants } from "./components/Badge";
export { Button, type ButtonProps, buttonVariants } from "./components/Button";
export { Card, type CardProps, cardVariants } from "./components/Card";
export {
  EmptyState,
  type EmptyStateProps,
  emptyStateVariants,
} from "./components/EmptyState";
export { Input, type InputProps, inputVariants } from "./components/Input";
export { Sheet, type SheetProps, sheetVariants } from "./components/Sheet";
export {
  Skeleton,
  type SkeletonProps,
  skeletonVariants,
} from "./components/Skeleton";
export { Switch, type SwitchProps } from "./components/Switch";
export { Text, type TextProps, textVariants } from "./components/Text";
export {
  type ToastOptions,
  ToastProvider,
  type ToastProviderProps,
  type ToastVariant,
  toastVariants,
  useToast,
} from "./components/Toast";
export {
  CategoryFilter,
  type CategoryFilterProps,
  type CategoryOption,
} from "./domain/CategoryFilter";
export {
  GestureCard,
  type GestureCardProps,
  type GestureSummary,
} from "./domain/GestureCard";
export { GestureGrid, type GestureGridProps } from "./domain/GestureGrid";
export { SearchBar, type SearchBarProps } from "./domain/SearchBar";
export { StatusBadge, type StatusBadgeProps } from "./domain/StatusBadge";
export { VideoPlayer, type VideoPlayerProps } from "./domain/VideoPlayer";
export { cn } from "./lib/cn";
