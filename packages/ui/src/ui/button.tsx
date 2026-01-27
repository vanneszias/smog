import type * as React from "react";

import { cn } from "../lib/utils";

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
};

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  const variantClasses = {
    default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
    outline:
      "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
    secondary:
      "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
    ghost:
      "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  };

  const sizeClasses = {
    default: "h-9 px-4 py-2",
    sm: "h-8 gap-1.5 rounded-md px-3",
    lg: "h-10 rounded-md px-6",
    icon: "size-9",
  };

  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      data-slot="button"
      type="button"
      {...props}
    />
  );
}

export { Button };
