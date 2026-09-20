import {
  Fallback as AvatarPrimitiveFallback,
  Image as AvatarPrimitiveImage,
  Root as AvatarPrimitiveRoot,
} from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * The initials for a name: first letter of the first word, first letter of
 * the last. `Array.from` rather than `[0]`, because a name can begin with a
 * character outside the basic plane and slicing a surrogate pair in half
 * renders a replacement glyph.
 *
 * Returns an empty string for an empty name, so a caller that has no name
 * gets an empty circle rather than a stray "?".
 */
export function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "";
  }
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last =
    words.length === 1 ? "" : (Array.from(words.at(-1) ?? "")[0] ?? "");
  return `${first}${last}`.toUpperCase();
}

export const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full bg-surface",
  {
    variants: {
      size: {
        sm: "size-8 text-sm",
        md: "size-10 text-md",
        lg: "size-12 text-lg",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export type AvatarProps = ComponentPropsWithoutRef<typeof AvatarPrimitiveRoot> &
  VariantProps<typeof avatarVariants>;

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, ...props }, ref) => (
    <AvatarPrimitiveRoot
      className={cn(avatarVariants({ size }), className)}
      ref={ref}
      {...props}
    />
  )
);

Avatar.displayName = "Avatar";

export type AvatarImageProps = ComponentPropsWithoutRef<
  typeof AvatarPrimitiveImage
> & {
  /** Required: an avatar with no alternative text is an unlabelled image. */
  alt: string;
};

export const AvatarImage = forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, ...props }, ref) => (
    <AvatarPrimitiveImage
      className={cn("aspect-square size-full object-cover", className)}
      ref={ref}
      {...props}
    />
  )
);

AvatarImage.displayName = "AvatarImage";

export type AvatarFallbackProps = ComponentPropsWithoutRef<
  typeof AvatarPrimitiveFallback
> & {
  /** Initials are derived from this when no children are given. */
  name?: string;
};

/**
 * What is shown while the image is loading and after it fails.
 *
 * Deriving the initials here rather than at every call site is the point:
 * Radix mounts this element in both states and cares only that *something*
 * is in it, so "falls back to initials" is our behaviour, not the
 * primitive's. Explicit children still win, for the cases where an icon or a
 * single letter is wanted instead.
 */
export const AvatarFallback = forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ className, name, children, ...props }, ref) => (
    <AvatarPrimitiveFallback
      className={cn(
        "flex size-full items-center justify-center bg-surface font-medium text-foreground-muted",
        className
      )}
      ref={ref}
      {...props}
    >
      {children ?? initialsFrom(name ?? "")}
    </AvatarPrimitiveFallback>
  )
);

AvatarFallback.displayName = "AvatarFallback";
