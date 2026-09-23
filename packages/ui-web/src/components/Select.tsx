import {
  Content as SelectPrimitiveContent,
  Group as SelectPrimitiveGroup,
  Icon as SelectPrimitiveIcon,
  Item as SelectPrimitiveItem,
  ItemIndicator as SelectPrimitiveItemIndicator,
  ItemText as SelectPrimitiveItemText,
  Label as SelectPrimitiveLabel,
  Portal as SelectPrimitivePortal,
  Root as SelectPrimitiveRoot,
  Separator as SelectPrimitiveSeparator,
  Trigger as SelectPrimitiveTrigger,
  Value as SelectPrimitiveValue,
  Viewport as SelectPrimitiveViewport,
} from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Radix's `Select` root is a plain function component — `declare const
 * Select: React.FC<SelectProps>` in `@radix-ui/react-select` — so it takes no
 * ref and there is nothing to forward. The trigger is the element a caller
 * needs a handle on, and that is where the ref, the classes and the sizing
 * live. Re-exported unchanged rather than wrapped, so no wrapper has to be
 * kept in step with the root's props.
 */
export const Select = SelectPrimitiveRoot;
export const SelectGroup = SelectPrimitiveGroup;
export const SelectValue = SelectPrimitiveValue;

/**
 * Sized on the same scale as `Input`, because a select and a text field sit
 * next to each other in every form and a one-pixel difference in height is
 * the sort of thing nobody can unsee.
 *
 * Border role: functional `border`, as for every other control edge.
 */
export const selectTriggerVariants = cva(
  "inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-foreground-muted [&>span]:truncate",
  {
    variants: {
      size: {
        sm: "h-8 text-sm",
        md: "h-10 text-md",
        lg: "h-12 text-lg",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export type SelectTriggerProps = ComponentPropsWithoutRef<
  typeof SelectPrimitiveTrigger
> &
  VariantProps<typeof selectTriggerVariants>;

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, size, children, ...props }, ref) => (
    <SelectPrimitiveTrigger
      className={cn(selectTriggerVariants({ size }), className)}
      ref={ref}
      {...props}
    >
      {children}
      <SelectPrimitiveIcon asChild>
        <ChevronDown aria-hidden="true" className="size-4 opacity-60" />
      </SelectPrimitiveIcon>
    </SelectPrimitiveTrigger>
  )
);

SelectTrigger.displayName = "SelectTrigger";

/**
 * The popup. Its edge is decorative — the shadow and the surface already say
 * where it is — so this one really is `border-subtle`.
 */
export const selectContentVariants = cva(
  "relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border-subtle bg-surface-raised text-foreground shadow-lg"
);

export type SelectContentProps = ComponentPropsWithoutRef<
  typeof SelectPrimitiveContent
>;

export const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, position = "popper", ...props }, ref) => (
    <SelectPrimitivePortal>
      <SelectPrimitiveContent
        className={cn(selectContentVariants(), className)}
        position={position}
        ref={ref}
        {...props}
      >
        <SelectPrimitiveViewport className="p-1">
          {children}
        </SelectPrimitiveViewport>
      </SelectPrimitiveContent>
    </SelectPrimitivePortal>
  )
);

SelectContent.displayName = "SelectContent";

export const selectItemVariants = cva(
  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-2 pr-2 pl-8 text-md outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface data-[highlighted]:text-foreground data-[disabled]:opacity-50"
);

export type SelectItemProps = ComponentPropsWithoutRef<
  typeof SelectPrimitiveItem
>;

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitiveItem
      className={cn(selectItemVariants(), className)}
      ref={ref}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitiveItemIndicator>
          <Check aria-hidden="true" className="size-4" />
        </SelectPrimitiveItemIndicator>
      </span>
      <SelectPrimitiveItemText>{children}</SelectPrimitiveItemText>
    </SelectPrimitiveItem>
  )
);

SelectItem.displayName = "SelectItem";

export type SelectLabelProps = ComponentPropsWithoutRef<
  typeof SelectPrimitiveLabel
>;

export const SelectLabel = forwardRef<HTMLDivElement, SelectLabelProps>(
  ({ className, ...props }, ref) => (
    <SelectPrimitiveLabel
      className={cn(
        "px-2 py-1 font-medium text-foreground-muted text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

SelectLabel.displayName = "SelectLabel";

export type SelectSeparatorProps = ComponentPropsWithoutRef<
  typeof SelectPrimitiveSeparator
>;

export const SelectSeparator = forwardRef<HTMLDivElement, SelectSeparatorProps>(
  ({ className, ...props }, ref) => (
    <SelectPrimitiveSeparator
      className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
      ref={ref}
      {...props}
    />
  )
);

SelectSeparator.displayName = "SelectSeparator";
