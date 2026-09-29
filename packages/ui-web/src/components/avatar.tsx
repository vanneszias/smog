import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const avatarVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-subtle font-medium text-primary-strong",
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        lg: "size-12 text-body",
        md: "size-10 text-body-sm",
        sm: "size-8 text-caption",
      },
    },
  }
);

export interface AvatarProps
  extends Omit<ComponentProps<"span">, "children">,
    VariantProps<typeof avatarVariants> {
  /** The person's name: the accessible name and the initials fallback. */
  name: string;
  /** The picture; the initials show until it loads (or when it fails). */
  src?: string | null;
}

const WHITESPACE = /\s+/;

/** Up to two initials: first and last word. */
function initialsOf(name: string): string {
  const words = name.trim().split(WHITESPACE).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** A round picture of a person with an initials fallback. */
export function Avatar({
  className,
  name,
  size,
  src,
  ...props
}: AvatarProps): ReactNode {
  return (
    <AvatarPrimitive.Root
      aria-label={name}
      className={cn(avatarVariants({ size }), className)}
      role="img"
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          alt=""
          className="size-full object-cover"
          src={src}
        />
      ) : null}
      <AvatarPrimitive.Fallback>{initialsOf(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
