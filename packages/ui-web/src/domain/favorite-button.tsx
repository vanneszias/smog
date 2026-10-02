import { useTranslation } from "@smog/i18n/react";
import { cva } from "class-variance-authority";
import { Heart } from "lucide-react";
import {
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { focusRing, hitArea, stateLayer, transition } from "../lib/variants";

const favoriteVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center rounded-full border",
    stateLayer.full,
    focusRing,
    transition,
  ],
  {
    defaultVariants: { size: "md", variant: "ghost" },
    variants: {
      active: {
        false: "text-foreground",
        true: "text-primary",
      },
      size: {
        lg: "size-12 *:size-6",
        md: "size-touch *:size-5",
        sm: cn("size-8 *:size-4", hitArea),
      },
      variant: {
        ghost: "border-transparent bg-transparent",
        // On a thumbnail: a solid chip so the heart reads on any frame.
        overlay: "border-border-subtle bg-surface shadow-1",
      },
    },
  }
);

export interface FavoriteButtonProps
  extends Omit<ComponentProps<"button">, "children" | "onToggle"> {
  active: boolean;
  /** The accessible name (`a11y.favorite` by default); the state is `aria-pressed`. */
  label?: string;
  /** Called with the next state at once (the caller updates optimistically). */
  onToggle: (active: boolean) => void;
  size?: "sm" | "md" | "lg";
  /** `overlay` sits on a thumbnail. */
  variant?: "ghost" | "overlay";
}

/** The heart toggle: `aria-pressed`, and a pop when it is switched on. */
export function FavoriteButton({
  active,
  className,
  label,
  onClick,
  onToggle,
  size,
  type,
  variant,
  ...props
}: FavoriteButtonProps): ReactNode {
  const { t } = useTranslation();
  const [popping, setPopping] = useState(false);
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      onClick?.(event);
      setPopping(!active);
      onToggle(!active);
    },
    [active, onClick, onToggle]
  );
  const settle = useCallback((): void => {
    setPopping(false);
  }, []);
  return (
    <button
      aria-label={label ?? t("a11y.favorite")}
      aria-pressed={active}
      className={cn(favoriteVariants({ active, size, variant }), className)}
      onClick={handleClick}
      type={type ?? "button"}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex *:size-full",
          popping && "animate-favorite-pop motion-reduce:animate-none"
        )}
        data-slot="favorite-icon"
        onAnimationEnd={settle}
      >
        <Heart className={active ? "fill-current" : undefined} />
      </span>
    </button>
  );
}
