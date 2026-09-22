import { cva, type VariantProps } from "class-variance-authority";
import { Image, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

/**
 * The initials for a name: first letter of the first word, first letter of
 * the last. `Array.from` rather than `[0]`, because a name can begin with a
 * character outside the basic plane and slicing a surrogate pair in half
 * renders a replacement glyph — same reasoning as
 * `packages/ui-web/src/components/Avatar.tsx`'s `initialsFrom`, kept private
 * here rather than shared: that one is wired into Radix's fallback-mounting
 * behaviour, which has no native equivalent to share it with.
 *
 * A single-word name (`"Ada"`) must not crash reaching for `parts[1]`, and
 * must not render a stray second initial either — hence the explicit
 * `words.length === 1` branch rather than `words.at(1)`.
 */
function initialsFrom(name: string): string {
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
  "items-center justify-center overflow-hidden rounded-full bg-surface",
  {
    variants: {
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export type AvatarProps = ViewProps &
  VariantProps<typeof avatarVariants> & {
    name: string;
    uri?: string | null;
    className?: string;
  };

/**
 * The native twin of `packages/ui-web/src/components/Avatar.tsx`, collapsed
 * into a single component: there is no loading/error distinction to model
 * here (React Native's `Image` has no Radix-style fallback lifecycle to
 * drive one), so `uri` present renders the image and `uri` absent renders
 * initials, decided once at render time rather than in response to a load
 * failure.
 */
export function Avatar({
  className,
  name,
  size,
  testID = "root",
  uri,
  ...props
}: AvatarProps) {
  return (
    <View
      accessibilityLabel={name}
      accessibilityRole="image"
      className={cn(avatarVariants({ size }), className)}
      testID={testID}
      {...props}
    >
      {uri == null ? (
        <Text className="font-medium text-foreground-muted" testID="initials">
          {initialsFrom(name)}
        </Text>
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          className="h-full w-full"
          source={{ uri }}
          testID="image"
        />
      )}
    </View>
  );
}
