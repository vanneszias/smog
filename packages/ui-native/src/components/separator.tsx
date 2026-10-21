import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

const separatorVariants = cva("shrink-0 bg-border", {
  defaultVariants: { orientation: "horizontal" },
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "h-full w-px",
    },
  },
});

export interface SeparatorProps
  extends Omit<ViewProps, "children">,
    VariantProps<typeof separatorVariants> {
  className?: string;
  ref?: Ref<View>;
}

/** A hairline between groups. Decorative: assistive tech skips it. */
export function Separator({
  className,
  orientation,
  ...props
}: SeparatorProps): ReactElement {
  return (
    <View
      accessibilityElementsHidden
      className={cn(separatorVariants({ orientation }), className)}
      importantForAccessibility="no-hide-descendants"
      {...props}
    />
  );
}
