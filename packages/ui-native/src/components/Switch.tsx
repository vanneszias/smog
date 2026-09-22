import {
  Switch as RNSwitch,
  type SwitchProps as RNSwitchProps,
} from "react-native";
import { cn } from "../lib/cn";

/**
 * The native twin of `packages/ui-web/src/components/Switch.tsx`, built
 * directly on React Native's own `Switch` rather than a custom track/thumb
 * pair: the host platform already renders a switch, and `toBeChecked()` (the
 * matcher this component's test relies on) only recognises a host `Switch`
 * element or an explicit checked/radio/switch role — building our own from a
 * `Pressable` would mean wiring that role and state by hand for no visual
 * gain.
 *
 * `label` is required and becomes `accessibilityLabel`: a bare switch has no
 * text of its own, so without it every switch in the app is an unlabelled
 * control to a screen reader — the same failure `Button`'s explicit
 * `accessibilityRole` and `Input`'s required `label` both guard against.
 *
 * The negation lives here, not at the call site: `onValueChange` receives
 * the *next* value, computed from the `value` this component was given
 * rather than from whatever the native event reports, so a caller's state
 * update is always `setValue(next)`, never `setValue(!value)` twice over.
 */
export type SwitchProps = Omit<
  RNSwitchProps,
  "disabled" | "onValueChange" | "value"
> & {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

export function Switch({
  className,
  disabled = false,
  label,
  onValueChange,
  testID = "root",
  value,
  ...props
}: SwitchProps) {
  function handleChange() {
    if (disabled) {
      return;
    }
    onValueChange(!value);
  }

  return (
    <RNSwitch
      accessibilityLabel={label}
      className={cn(className)}
      disabled={disabled}
      onValueChange={handleChange}
      testID={testID}
      value={value}
      {...props}
    />
  );
}
