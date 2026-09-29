import { useTranslation } from "@smog/i18n/react";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import {
  type ReactElement,
  type Ref,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { TextInput } from "react-native";
import { IconButton } from "./icon-button";
import { Input, type InputProps } from "./input";

export interface SearchFieldProps
  extends Omit<InputProps, "leading" | "trailing" | "onChangeText"> {
  defaultValue?: string;
  /** Called after the clear button emptied the field. */
  onClear?: () => void;
  onValueChange?: (value: string) => void;
  ref?: Ref<TextInput | null>;
  value?: string;
}

/** A search input with a clear button (`a11y.clearSearch`) that refocuses it. */
export function SearchField({
  "aria-label": ariaLabel,
  accessibilityLabel,
  defaultValue = "",
  onClear,
  onValueChange,
  placeholder,
  ref,
  value: controlled,
  ...props
}: SearchFieldProps): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle<TextInput | null, TextInput | null>(
    ref,
    () => inputRef.current,
    []
  );
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const change = useCallback(
    (next: string): void => {
      setUncontrolled(next);
      onValueChange?.(next);
    },
    [onValueChange]
  );
  const clear = useCallback((): void => {
    change("");
    onClear?.();
    inputRef.current?.focus();
  }, [change, onClear]);
  return (
    <Input
      accessibilityLabel={accessibilityLabel ?? ariaLabel ?? t("common.search")}
      accessibilityRole="search"
      autoCapitalize="none"
      autoCorrect={false}
      leading={<Search />}
      onChangeText={change}
      placeholder={placeholder ?? t("kit.searchPlaceholder")}
      ref={inputRef}
      returnKeyType="search"
      trailing={
        value ? (
          <IconButton
            icon={<X />}
            label={t("a11y.clearSearch")}
            onPress={clear}
            size="sm"
          />
        ) : null
      }
      value={value}
      {...props}
    />
  );
}
