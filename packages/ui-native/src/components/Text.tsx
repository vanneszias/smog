import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";

export type TextProps = RNTextProps & { className?: string };

export function Text({ className, ...props }: TextProps) {
  return <RNText className={cn("text-foreground", className)} {...props} />;
}
