import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, hitArea, transition } from "../lib/variants";
import { useFieldControl } from "./field";

export interface CheckboxProps
  extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "children"> {
  description?: ReactNode;
  invalid?: boolean;
  /** The visible label; clicking it toggles the box. */
  label?: ReactNode;
}

/** A 20 px box with a 44 px hit area; `checked` may be `"indeterminate"`. */
export function Checkbox({
  className,
  description,
  id,
  label,
  ...rest
}: CheckboxProps): ReactNode {
  const generated = useId();
  const { invalid: _invalid, ...props } = useFieldControl({
    ...rest,
    id: id ?? (label ? generated : undefined),
  });
  const box = (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-input bg-card text-primary-foreground",
        "hover:border-foreground data-[state=indeterminate]:border-primary data-checked:border-primary data-[state=indeterminate]:bg-primary data-checked:bg-primary",
        "aria-invalid:border-destructive",
        hitArea,
        focusRing,
        transition,
        disabled,
        className
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="inline-flex"
        data-slot="checkbox-indicator"
      >
        {props.checked === "indeterminate" ? (
          <Minus aria-hidden="true" className="size-4" strokeWidth={3} />
        ) : (
          <Check aria-hidden="true" className="size-4" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) {
    return box;
  }
  return (
    <div className="flex min-h-touch items-start gap-3 py-3">
      <span className="flex h-6 items-center">{box}</span>
      <span className="flex flex-col">
        <label
          className={cn(
            "text-body text-foreground",
            props.disabled ? "cursor-default opacity-50" : "cursor-pointer"
          )}
          htmlFor={props.id}
        >
          {label}
        </label>
        {description ? (
          <span className="text-body-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
