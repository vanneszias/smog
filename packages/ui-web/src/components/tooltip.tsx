import { tokens } from "@smog/styles/tokens";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";

/** Web only. Wrap the app (or the page) once. */
export function TooltipProvider({
  delayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>): ReactNode {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export interface TooltipProps
  extends Omit<ComponentProps<typeof TooltipPrimitive.Root>, "children"> {
  align?: ComponentProps<typeof TooltipPrimitive.Content>["align"];
  /** The trigger: one focusable element. */
  children: ReactNode;
  className?: string;
  /** The hint. It supplements the trigger's accessible name, never replaces it. */
  content: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>["side"];
}

/** A short hint on hover and keyboard focus (web only; native has no hover). */
export function Tooltip({
  align,
  children,
  className,
  content,
  side = "top",
  ...props
}: TooltipProps): ReactNode {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={container}>
        <TooltipPrimitive.Content
          align={align}
          className={cn(
            "z-50 max-w-reading rounded-sm bg-foreground px-2 py-1 text-background text-caption shadow-2",
            "data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in motion-reduce:animate-none",
            className
          )}
          data-slot="tooltip"
          side={side}
          sideOffset={tokens.spacing["1"]}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
