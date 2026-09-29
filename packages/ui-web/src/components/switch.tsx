import { Switch as SwitchPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, hitArea, transition } from "../lib/variants";
import { useFieldControl } from "./field";

export interface SwitchProps
  extends Omit<ComponentProps<typeof SwitchPrimitive.Root>, "children"> {
  description?: ReactNode;
  invalid?: boolean;
  /** The visible label, placed before the switch; clicking it toggles. */
  label?: ReactNode;
}

/** An on/off toggle that applies immediately (settings), 44 px hit area. */
export function Switch({
  className,
  description,
  id,
  label,
  ...rest
}: SwitchProps): ReactNode {
  const generated = useId();
  const { invalid: _invalid, ...props } = useFieldControl({
    ...rest,
    id: id ?? (label ? generated : undefined),
  });
  const control = (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-foreground-muted data-[state=checked]:bg-primary",
        hitArea,
        focusRing,
        transition,
        disabled,
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="pointer-events-none block size-5 rounded-full bg-surface shadow-1 transition-transform duration-fast ease-standard data-[state=checked]:translate-x-4 motion-reduce:transition-none"
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
  if (!label) {
    return control;
  }
  return (
    <div className="flex min-h-touch items-center justify-between gap-4 py-2">
      <span className="flex flex-col">
        <label
          className="cursor-pointer text-body text-foreground"
          htmlFor={props.id}
        >
          {label}
        </label>
        {description ? (
          <span className="text-body-sm text-foreground-muted">
            {description}
          </span>
        ) : null}
      </span>
      {control}
    </div>
  );
}
