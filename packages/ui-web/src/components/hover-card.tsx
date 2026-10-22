import { tokens } from "@smog/styles/tokens";
import { HoverCard as HoverCardPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";

function HoverCard({
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  );
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = tokens.spacing["1"],
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <HoverCardPrimitive.Portal
      container={container}
      data-slot="hover-card-portal"
    >
      <HoverCardPrimitive.Content
        align={align}
        className={cn(
          "z-50 w-72 max-w-reading origin-(--radix-hover-card-content-transform-origin) rounded-2xl bg-popover p-4 text-body-sm text-popover-foreground shadow-2 outline-hidden ring-1 ring-foreground/10 data-closed:animate-fade-out data-open:animate-fade-in motion-reduce:animate-none",
          className
        )}
        data-slot="hover-card-content"
        sideOffset={sideOffset}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
