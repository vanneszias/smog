import { cva, type VariantProps } from "class-variance-authority";
import {
  type AccessibilityState,
  TextInput,
  type TextInputProps,
} from "react-native";
import { cn } from "../lib/cn";

/**
 * React Native's own `AccessibilityState` type has no `invalid` key — only
 * `disabled`, `selected`, `checked`, `busy` and `expanded` — so a bare object
 * literal on the prop fails TypeScript's excess-property check even though
 * the runtime happily carries the extra field through to an assistive
 * technology bridge that reads it. Widening the type locally, once, is the
 * documented escape hatch for a state ARIA has but this platform's own
 * types have not caught up to yet.
 */
type ExtendedAccessibilityState = AccessibilityState & { invalid?: boolean };

/**
 * The native twin of `packages/ui-web/src/components/Input.tsx`, minus the
 * `size` HTML-attribute collision that forces web to `Omit` it — a React
 * Native `TextInput` has no such prop, so the variant name is free.
 *
 * Border role: the same call as web's `CONTROL_BASE` — a text control's edge
 * is the only thing saying where the control is, so it is the functional
 * `border`, never the decorative `border-subtle`.
 *
 * `label` is required, not optional. A `TextInput` only gets an accessible
 * name from `accessibilityLabel` (there is no `<label for>` on a phone), so
 * an optional prop is how every unlabelled text field in the app happens.
 * It is deliberately not rendered as visible text — a caller who wants a
 * visible label pairs this with `Text` themselves; this component only
 * guarantees the control is never unlabelled to assistive technology.
 */
export const inputVariants = cva(
  "w-full rounded-md border border-border bg-surface px-md text-foreground",
  {
    variants: {
      invalid: {
        true: "border-danger",
        false: "",
      },
      size: {
        sm: "h-8 text-sm",
        md: "h-10 text-md",
        lg: "h-12 text-lg",
      },
    },
    defaultVariants: { invalid: false, size: "md" },
  }
);

export type InputProps = TextInputProps &
  VariantProps<typeof inputVariants> & {
    label: string;
    className?: string;
  };

export function Input({
  className,
  invalid,
  label,
  size,
  testID = "root",
  ...props
}: InputProps) {
  const accessibilityState: ExtendedAccessibilityState = {
    invalid: invalid === true,
  };

  return (
    <TextInput
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      className={cn(inputVariants({ invalid, size }), className)}
      testID={testID}
      {...props}
    />
  );
}
