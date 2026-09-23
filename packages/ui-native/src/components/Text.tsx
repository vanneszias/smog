import { cva, type VariantProps } from "class-variance-authority";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "../lib/cn";

/**
 * `variant` carries colour and weight; `size` carries scale. The two are
 * independent dimensions, same as `Button`'s `variant` and `size` — a
 * "muted" heading and a "body" heading both exist.
 */
export const textVariants = cva("", {
  variants: {
    variant: {
      body: "text-foreground",
      muted: "text-foreground-muted",
      heading: "font-semibold text-foreground",
      title: "font-semibold text-foreground",
    },
    size: {
      xs: "text-xs",
      sm: "text-sm",
      md: "text-md",
      lg: "text-lg",
      xl: "text-xl",
    },
  },
  defaultVariants: { variant: "body", size: "md" },
});

export type TextProps = RNTextProps &
  VariantProps<typeof textVariants> & { className?: string };

export function Text({
  className,
  size,
  testID = "root",
  variant,
  ...props
}: TextProps) {
  return (
    <RNText
      className={cn(textVariants({ size, variant }), className)}
      testID={testID}
      {...props}
    />
  );
}
