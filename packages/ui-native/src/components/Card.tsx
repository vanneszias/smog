import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

/**
 * Border role, same call as `packages/ui-web/src/components/Card.tsx`. A
 * static card's edge is decoration — the surface and the heading still say
 * where the card is without it — so it is `border-subtle`. An `interactive`
 * card is a control, the whole rectangle is the touch target, and its edge is
 * the only thing saying so, so it takes the functional `border`.
 *
 * No `focus-within` ring here: that is a pointer/keyboard-focus concept with
 * no native equivalent, so the platform difference is the ring, not the
 * border role, which is what this component's test pins down.
 */
export const cardVariants = cva("rounded-lg bg-surface-raised", {
  variants: {
    interactive: {
      true: "border border-border",
      false: "border border-border-subtle",
    },
  },
  defaultVariants: { interactive: false },
});

export type CardProps = ViewProps &
  VariantProps<typeof cardVariants> & {
    children?: ReactNode;
    className?: string;
  };

export function Card({
  children,
  className,
  interactive,
  testID = "root",
  ...props
}: CardProps) {
  return (
    <View
      className={cn(cardVariants({ interactive }), className)}
      testID={testID}
      {...props}
    >
      {children}
    </View>
  );
}
