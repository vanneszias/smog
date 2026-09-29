import { cva, type VariantProps } from "class-variance-authority";
import { type ReactElement, type Ref, useCallback, useState } from "react";
import { Image, Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

const avatarVariants = cva(
  "items-center justify-center overflow-hidden rounded-full bg-primary-subtle",
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        lg: "size-12",
        md: "size-10",
        sm: "size-8",
      },
    },
  }
);

const initialsVariants = cva("font-medium text-primary-strong", {
  defaultVariants: { size: "md" },
  variants: {
    size: { lg: "text-body", md: "text-body-sm", sm: "text-caption" },
  },
});

export interface AvatarProps
  extends Omit<ViewProps, "children">,
    VariantProps<typeof avatarVariants> {
  /** The person's name: the accessible name and the initials fallback. */
  name: string;
  ref?: Ref<View>;
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
}: AvatarProps): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const handleError = useCallback((): void => {
    setFailed(true);
  }, []);
  const handleLoad = useCallback((): void => {
    setLoaded(true);
  }, []);
  return (
    <View
      accessibilityLabel={name}
      accessibilityRole="image"
      accessible
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {showImage && loaded ? null : (
        <Text className={initialsVariants({ size })}>{initialsOf(name)}</Text>
      )}
      {showImage && src ? (
        <Image
          className={cn("absolute inset-0 size-full", !loaded && "opacity-0")}
          onError={handleError}
          onLoad={handleLoad}
          source={{ uri: src }}
        />
      ) : null}
    </View>
  );
}
