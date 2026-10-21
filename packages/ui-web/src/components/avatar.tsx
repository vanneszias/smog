import { cva, type VariantProps } from "class-variance-authority";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const avatarVariants = cva(
  "group/avatar relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-subtle font-medium text-primary-strong after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
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
      data-size={size ?? "md"}
      data-slot="avatar"
      role="img"
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          alt=""
          className="aspect-square size-full object-cover"
          data-slot="avatar-image"
          src={src}
        />
      ) : null}
      {/* The initials are generated content, not text: an avatar inside a
          named control (the user menu's button) would otherwise be "visible
          text missing from the accessible name" (axe 4.14
          label-content-name-mismatch, WCAG 2.5.3). The image role names it. */}
      <AvatarPrimitive.Fallback
        aria-hidden="true"
        className="before:content-[attr(data-initials)]"
        data-initials={initialsOf(name)}
        data-slot="avatar-fallback"
      />
    </AvatarPrimitive.Root>
  );
}
