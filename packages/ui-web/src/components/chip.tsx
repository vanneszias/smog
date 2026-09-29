import { useTranslation } from "@smog/i18n/react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, X } from "lucide-react";
import {
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  useCallback,
} from "react";
import { cn } from "../lib/cn";
import {
  disabled,
  focusRing,
  hitArea,
  stateLayer,
  transition,
} from "../lib/variants";

const chipVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full border font-medium",
    stateLayer.full,
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { selected: false, size: "md" },
    variants: {
      selected: {
        false: "border-foreground-muted bg-surface text-foreground",
        true: "border-primary bg-primary-subtle text-primary-strong",
      },
      size: {
        md: "min-h-touch px-4 text-body-sm",
        // Dense filters; the pseudo-element keeps a 44 px target.
        sm: cn("min-h-8 px-3 text-caption", hitArea),
      },
    },
  }
);

export interface ChipProps
  extends Omit<ComponentProps<"button">, "onClick">,
    Omit<VariantProps<typeof chipVariants>, "selected"> {
  /** A leading decorative icon (replaced by a check while selected). */
  icon?: ReactNode;
  onClick?: ComponentProps<"button">["onClick"];
  /** Shows a trailing remove button named `a11y.remove`. */
  onRemove?: () => void;
  /** Called with the next selected state. */
  onSelectedChange?: (selected: boolean) => void;
  /** Makes the chip a toggle (`aria-pressed`). */
  selected?: boolean;
}

/** A pill-shaped filter or tag; selectable (`selected`) and/or removable (`onRemove`). */
export function Chip({
  children,
  className,
  icon,
  onClick,
  onRemove,
  onSelectedChange,
  selected,
  size,
  type,
  ...props
}: ChipProps): ReactNode {
  const { t } = useTranslation();
  const isToggle = selected !== undefined;
  let leading: ReactNode = icon ?? null;
  if (selected) {
    leading = <Check />;
  }
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      if (isToggle) {
        onSelectedChange?.(!selected);
      }
    },
    [isToggle, onClick, onSelectedChange, selected]
  );
  const chip = (
    <button
      aria-pressed={isToggle ? selected : undefined}
      className={cn(
        chipVariants({ selected: selected ?? false, size }),
        onRemove && "pr-10",
        className
      )}
      onClick={handleClick}
      type={type ?? "button"}
      {...props}
    >
      {leading ? (
        <span aria-hidden="true" className="relative inline-flex *:size-4">
          {leading}
        </span>
      ) : null}
      <span className="relative">{children}</span>
    </button>
  );
  if (!onRemove) {
    return chip;
  }
  return (
    <span className="relative inline-flex">
      {chip}
      <button
        aria-label={t("a11y.remove", { label: textOf(children) })}
        className={cn(
          // hitArea first: its `relative` must lose to `absolute`.
          hitArea,
          "absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken hover:text-foreground",
          focusRing,
          transition
        )}
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  return "";
}
