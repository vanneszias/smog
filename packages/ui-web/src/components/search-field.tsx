import { useTranslation } from "@smog/i18n/react";
import { Search, X } from "lucide-react";
import {
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import type { FieldVariantProps } from "../lib/variants";
import { IconButton } from "./icon-button";
import { Input } from "./input";

export interface SearchFieldProps
  extends Omit<
      ComponentProps<"input">,
      "size" | "type" | "value" | "defaultValue" | "onChange"
    >,
    FieldVariantProps {
  defaultValue?: string;
  /** Called after the clear button emptied the field. */
  onClear?: () => void;
  onValueChange?: (value: string) => void;
  /** Controlled value. */
  value?: string;
}

/** A search input with a leading icon and a clear button (`a11y.clearSearch`). */
export function SearchField({
  "aria-label": ariaLabel,
  className,
  defaultValue = "",
  onClear,
  onValueChange,
  placeholder,
  ref,
  size,
  value,
  ...props
}: SearchFieldProps): ReactNode {
  const { t } = useTranslation();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = value ?? uncontrolled;
  const inner = useRef<HTMLInputElement | null>(null);

  const update = useCallback(
    (next: string): void => {
      if (value === undefined) {
        setUncontrolled(next);
      }
      onValueChange?.(next);
    },
    [onValueChange, value]
  );
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      update(event.currentTarget.value);
    },
    [update]
  );
  const handleClear = useCallback((): void => {
    update("");
    onClear?.();
    inner.current?.focus();
  }, [onClear, update]);
  const setRef = useCallback(
    (node: HTMLInputElement | null): void => {
      inner.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  return (
    <Input
      aria-label={ariaLabel ?? t("common.search")}
      className={className}
      data-slot="search-field"
      enterKeyHint="search"
      leading={<Search />}
      onChange={handleChange}
      placeholder={placeholder ?? t("kit.searchPlaceholder")}
      ref={setRef}
      size={size}
      trailing={
        current ? (
          <IconButton
            icon={<X />}
            label={t("a11y.clearSearch")}
            onClick={handleClear}
          />
        ) : null
      }
      type="search"
      value={current}
      {...props}
    />
  );
}
