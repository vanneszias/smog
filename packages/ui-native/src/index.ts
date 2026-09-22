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
export {
  Skeleton,
  type SkeletonProps,
  skeletonVariants,
} from "./components/Skeleton";
export { Switch, type SwitchProps } from "./components/Switch";
export { Text, type TextProps, textVariants } from "./components/Text";
export { cn } from "./lib/cn";
