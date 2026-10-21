import type { ColorRole } from "@smog/styles/tokens";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, type ReactElement, type Ref, useContext } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

/**
 * The surface the content sits on: the page (`default`), the filled green
 * (`primary`: hero, auth) or the deeper green of the header (`header`).
 */
export type SurfaceTone = "default" | "header" | "primary";

const SurfaceContext = createContext<SurfaceTone>("default");

/** The tone of the nearest `Surface` (`default` outside one). */
export function useSurface(): SurfaceTone {
  return useContext(SurfaceContext);
}

/** What the kit reads on each surface: text, secondary text, the focus ring. */
export interface SurfaceRoles {
  foreground: ColorRole;
  foregroundClass: string;
  muted: ColorRole;
  mutedClass: string;
  ring: ColorRole;
}

const SURFACE_ROLES: Record<SurfaceTone, SurfaceRoles> = {
  default: {
    foreground: "foreground",
    foregroundClass: "text-foreground",
    muted: "mutedForeground",
    mutedClass: "text-muted-foreground",
    ring: "ring",
  },
  header: {
    foreground: "sidebarForeground",
    foregroundClass: "text-sidebar-foreground",
    muted: "sidebarForegroundMuted",
    mutedClass: "text-sidebar-foreground-muted",
    ring: "sidebarRing",
  },
  primary: {
    foreground: "primaryForeground",
    foregroundClass: "text-primary-foreground",
    muted: "primaryForegroundMuted",
    mutedClass: "text-primary-foreground-muted",
    ring: "primaryRing",
  },
};

/** The roles of a surface tone. */
export function surfaceRoles(tone: SurfaceTone): SurfaceRoles {
  return SURFACE_ROLES[tone];
}

const surfaceVariants = cva("", {
  defaultVariants: { tone: "primary" },
  variants: {
    tone: {
      default: "bg-background",
      header: "bg-sidebar",
      primary: "bg-primary",
    },
  },
});

export interface SurfaceProps
  extends ViewProps,
    VariantProps<typeof surfaceVariants> {
  className?: string;
  ref?: Ref<View>;
}

/**
 * A green (or plain) surface. `Text`, `Heading`, `Button` and `IconButton`
 * inside it switch to their on-green colours: white text, a white outline
 * for `secondary`, and the orange highlight for `primary` (green on green
 * would vanish). Every pair is in `@smog/styles/contrast`.
 */
export function Surface({
  className,
  tone,
  ...props
}: SurfaceProps): ReactElement {
  const resolved: SurfaceTone = tone ?? "primary";
  return (
    <SurfaceContext.Provider value={resolved}>
      <View
        className={cn(surfaceVariants({ tone: resolved }), className)}
        {...props}
      />
    </SurfaceContext.Provider>
  );
}
