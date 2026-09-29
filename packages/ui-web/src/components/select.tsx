import { useTranslation } from "@smog/i18n/react";
import { tokens } from "@smog/styles/tokens";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";
import { type FieldVariantProps, fieldVariants } from "../lib/variants";
import { useFieldControl } from "./field";

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<
      ComponentProps<typeof SelectPrimitive.Trigger>,
      "children" | "defaultValue" | "value" | "dir"
    >,
    FieldVariantProps {
  defaultOpen?: boolean;
  defaultValue?: string;
  invalid?: boolean;
  /** Form field name (a hidden native select is rendered for forms). */
  name?: string;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
  open?: boolean;
  options: readonly SelectOption[];
  /** Shown when nothing is selected (`kit.selectPlaceholder` by default). */
  placeholder?: string;
  required?: boolean;
  value?: string;
}

/** A single choice from a short list (Radix Select: a sheet-like picker on native). */
export function Select({
  className,
  defaultOpen,
  defaultValue,
  disabled,
  name,
  onOpenChange,
  onValueChange,
  open,
  options,
  placeholder,
  required,
  size,
  value,
  ...rest
}: SelectProps): ReactNode {
  const { t } = useTranslation();
  const container = usePortalContainer();
  const { invalid: _invalid, ...trigger } = useFieldControl({
    ...rest,
    required,
  });
  return (
    <SelectPrimitive.Root
      defaultOpen={defaultOpen}
      defaultValue={defaultValue}
      disabled={disabled}
      name={name}
      onOpenChange={onOpenChange}
      onValueChange={onValueChange}
      open={open}
      required={trigger.required}
      value={value}
    >
      <SelectPrimitive.Trigger
        className={cn(
          fieldVariants({ size }),
          "flex items-center justify-between gap-2 text-left data-placeholder:text-foreground-muted",
          className
        )}
        {...trigger}
      >
        <SelectPrimitive.Value
          placeholder={placeholder ?? t("kit.selectPlaceholder")}
        />
        <SelectPrimitive.Icon className="shrink-0 text-foreground-muted">
          <ChevronDown aria-hidden="true" className="size-5" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          className="relative z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface-raised text-foreground shadow-2 data-[state=open]:animate-fade-in"
          position="popper"
          sideOffset={tokens.spacing["1"]}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                className="relative flex min-h-touch cursor-default select-none items-center gap-2 rounded-sm py-2 pr-3 pl-8 text-body outline-none data-disabled:pointer-events-none data-highlighted:bg-surface-sunken data-disabled:opacity-50"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex text-primary-strong">
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
