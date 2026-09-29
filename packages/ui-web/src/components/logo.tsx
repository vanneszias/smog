import { logoStackedSvg, logoSvg } from "@smog/brand/svg";
import { useTranslation } from "@smog/i18n/react";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const logoVariants = cva("inline-flex shrink-0 *:h-full *:w-auto", {
  defaultVariants: { size: "md", tone: "primary", variant: "horizontal" },
  variants: {
    size: {
      lg: "h-12",
      md: "h-8",
      sm: "h-6",
    },
    tone: {
      current: "",
      foreground: "text-foreground",
      primary: "text-primary",
    },
    variant: {
      horizontal: "",
      stacked: "",
    },
  },
});

const SVG = { horizontal: logoSvg, stacked: logoStackedSvg } as const;

export interface LogoProps
  extends Omit<ComponentProps<"span">, "children">,
    VariantProps<typeof logoVariants> {
  /** Hide it from assistive tech (e.g. next to the app name in text). */
  decorative?: boolean;
}

/** The SMOG & Co logo, inline SVG in `currentColor` (from `@smog/brand/svg`). */
export function Logo({
  className,
  decorative = false,
  size,
  tone,
  variant,
  ...props
}: LogoProps): ReactNode {
  const { t } = useTranslation();
  const classes = cn(logoVariants({ size, tone, variant }), className);
  const svg = { __html: SVG[variant ?? "horizontal"] };
  if (decorative) {
    return (
      <span
        aria-hidden="true"
        className={classes}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
        dangerouslySetInnerHTML={svg}
        {...props}
      />
    );
  }
  return (
    <span
      aria-label={t("a11y.logo")}
      className={classes}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
      dangerouslySetInnerHTML={svg}
      role="img"
      {...props}
    />
  );
}
