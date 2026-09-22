import { cva, type VariantProps } from "class-variance-authority";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

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
 *
 * `errorMessage`, not `accessibilityState.invalid`. `AccessibilityState` (see
 * `react-native`'s own `ViewAccessibility.d.ts`) has exactly five keys —
 * `disabled`, `selected`, `checked`, `busy`, `expanded` — and this version of
 * React Native never reads a sixth: iOS's view manager remaps only those five
 * plus role, and Android's `ReactAccessibilityDelegate` looks up only
 * `disabled`, `selected` and `checked` from it. There is no `aria-invalid`
 * anywhere in this codebase. A hand-added `invalid` key on that object is
 * therefore inert — present in the prop, read by nothing, announced by
 * nobody — no matter how it is typed.
 *
 * `accessibilityHint` is the real mechanism both platforms consume directly:
 * iOS remaps it straight onto `UIAccessibilityElement.accessibilityHint`
 * (`React/Views/RCTViewManager.m:180`, and Fabric's
 * `RCTViewComponentView.mm:391-393`), and Android sets it as the host view's
 * `tooltipText` (`ReactAccessibilityDelegate.kt:82-88`) — both are read aloud
 * by VoiceOver and TalkBack respectively. So `errorMessage` becomes an
 * accessibility guarantee through a prop that is actually wired up, and is
 * mirrored as visible text below the field for a sighted user. `invalid`
 * stays exactly what it always was — the border-colour variant — and is
 * deliberately not derived from `errorMessage`: a caller may want the red
 * border the moment a field is touched, before there is a message to show.
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
    /**
     * Rendered as visible text below the field and set as the input's
     * `accessibilityHint`, so an error reaches both a sighted user and a
     * screen reader from one prop.
     */
    errorMessage?: string;
    className?: string;
  };

export function Input({
  className,
  errorMessage,
  invalid,
  label,
  size,
  testID = "root",
  ...props
}: InputProps) {
  return (
    <>
      <TextInput
        accessibilityHint={errorMessage}
        accessibilityLabel={label}
        className={cn(inputVariants({ invalid, size }), className)}
        testID={testID}
        {...props}
      />
      {errorMessage == null ? null : (
        <Text className="text-danger" testID={`${testID}-error`} variant="body">
          {errorMessage}
        </Text>
      )}
    </>
  );
}
