import { useTranslation } from "@smog/i18n/react";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { type ReactElement, type Ref, useCallback } from "react";
import { Pressable, type PressableProps, Text, View } from "react-native";
import { cn } from "../lib/cn";
import { useControllableState } from "../lib/controllable";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";
import { useFieldControl } from "./field";
import { fieldVariants } from "./input";
import { SheetPanel } from "./sheet-panel";
import { Heading } from "./text";

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<PressableProps, "children" | "style" | "onPress"> {
  "aria-label"?: string;
  className?: string;
  defaultOpen?: boolean;
  defaultValue?: string;
  invalid?: boolean;
  /** Web form name; native has no forms, so it is ignored. */
  name?: string;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
  open?: boolean;
  options: readonly SelectOption[];
  /** Shown while nothing is selected (`kit.selectPlaceholder`). */
  placeholder?: string;
  ref?: Ref<View>;
  required?: boolean;
  size?: "md" | "lg";
  value?: string;
}

/**
 * A field-styled `combobox` that opens a picker sheet of `radio` options.
 * Same props as web's Radix Select; inside a Field it takes the label.
 */
export function Select({
  accessibilityLabel,
  "aria-label": ariaLabel,
  className,
  defaultOpen = false,
  defaultValue,
  disabled: disabledProp,
  invalid,
  name: _name,
  onOpenChange,
  onValueChange,
  open,
  options,
  placeholder,
  required,
  size,
  value,
  ...props
}: SelectProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const { t } = useTranslation();
  const field = useFieldControl({
    accessibilityLabel: accessibilityLabel ?? ariaLabel,
    invalid,
    required,
  });
  const [isOpen, setOpen] = useControllableState(
    open,
    defaultOpen,
    onOpenChange
  );
  const [selected, setSelected] = useControllableState<string>(
    value,
    defaultValue,
    onValueChange
  );
  const iconColor = useColor("foregroundMuted");
  const show = useCallback((): void => {
    setOpen(true);
  }, [setOpen]);
  const close = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);
  const choose = useCallback(
    (next: string): void => {
      setSelected(next);
      setOpen(false);
    },
    [setOpen, setSelected]
  );
  const current = options.find((option) => option.value === selected);
  return (
    <>
      <Pressable
        accessibilityHint={field.accessibilityHint}
        accessibilityLabel={field.accessibilityLabel}
        accessibilityRole="combobox"
        accessibilityState={{ disabled, expanded: isOpen }}
        className={cn(
          fieldVariants({ invalid: field.invalid, size }),
          "justify-between",
          disabled && "opacity-50",
          className
        )}
        disabled={disabled}
        onPress={show}
        {...props}
      >
        <Text
          className={cn(
            "flex-1 text-body",
            current ? "text-foreground" : "text-foreground-muted"
          )}
          numberOfLines={1}
        >
          {current?.label ?? placeholder ?? t("kit.selectPlaceholder")}
        </Text>
        <ChevronDown color={iconColor} size={ICON_SIZE.md} />
      </Pressable>
      <SheetPanel onClose={close} open={isOpen}>
        {field.accessibilityLabel ? (
          <Heading size="title-3">{field.accessibilityLabel}</Heading>
        ) : null}
        <View accessibilityRole="radiogroup" className="-mx-2 flex-col">
          {options.map((option) => (
            <SelectItem
              checked={option.value === selected}
              key={option.value}
              onChoose={choose}
              option={option}
            />
          ))}
        </View>
      </SheetPanel>
    </>
  );
}

function SelectItem({
  checked,
  onChoose,
  option,
}: {
  checked: boolean;
  onChoose: (value: string) => void;
  option: SelectOption;
}): ReactElement {
  const checkColor = useColor("primary");
  const inactive = option.disabled === true;
  const choose = useCallback((): void => {
    onChoose(option.value);
  }, [onChoose, option.value]);
  return (
    <Pressable
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled: inactive }}
      className={cn(
        "min-h-touch flex-row items-center gap-3 rounded-md px-2 active:bg-surface-sunken",
        inactive && "opacity-50"
      )}
      disabled={inactive}
      onPress={choose}
    >
      <Text
        className={cn(
          "flex-1 text-body text-foreground",
          checked && "font-semibold"
        )}
      >
        {option.label}
      </Text>
      {checked ? <Check color={checkColor} size={ICON_SIZE.md} /> : null}
    </Pressable>
  );
}
