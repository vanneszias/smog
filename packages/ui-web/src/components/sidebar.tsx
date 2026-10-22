import { useTranslation } from "@smog/i18n/react";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import { Slot } from "radix-ui";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { isEditingTarget } from "../lib/editing-target";
import { useIsMobile } from "../lib/use-mobile";
import { disabled, transition } from "../lib/variants";
import { IconButton, type IconButtonProps } from "./icon-button";
import { Sheet, SheetContent } from "./sheet";
import { Tooltip } from "./tooltip";

/**
 * The registry sidebar, trimmed to what the site's shells need: a provider
 * with the `Ctrl/Cmd + B` shortcut, `Sidebar` (a fixed panel from `md`, a
 * Sheet below it), a trigger, an inset and the group / menu parts. The rail,
 * the sub-menus, the menu badge and action, and the cookie that remembered
 * the state are left out: nothing uses them, and the state is the caller's
 * (`open` / `onOpenChange`).
 */

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

interface SidebarContextProps {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

export function useSidebar(): SidebarContextProps {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error(
      "[ui-web] useSidebar must be used inside <SidebarProvider>"
    );
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ReactNode {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) {
        onOpenChange(next);
      } else {
        setOpenState(next);
      }
    },
    [onOpenChange]
  );
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      setOpen(!open);
    }
  }, [isMobile, open, setOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey) &&
        // In a text field Ctrl/Cmd+B is the editor's (bold) or the browser's.
        !isEditingTarget(event.target)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const value = useMemo<SidebarContextProps>(
    () => ({
      isMobile,
      open,
      openMobile,
      setOpen,
      setOpenMobile,
      state,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, state, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  collapsible?: "offcanvas" | "icon" | "none";
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
}): ReactNode {
  const { t } = useTranslation();
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        data-slot="sidebar"
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground"
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          side={side === "left" ? "left" : "right"}
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as CSSProperties}
          title={t("a11y.sidebar")}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      {/* The gap that keeps the page content beside the fixed panel. */}
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-normal ease-standard motion-reduce:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
        data-slot="sidebar-gap"
      />
      <div
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-normal ease-standard data-[side=right]:right-0 data-[side=left]:left-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] motion-reduce:transition-none md:flex",
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-sidebar-border group-data-[side=right]:border-sidebar-border group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        data-side={side}
        data-slot="sidebar-container"
        {...props}
      >
        <div
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-2xl group-data-[variant=floating]:shadow-2 group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The button that opens and closes the sidebar (named `a11y.toggleSidebar`). */
export function SidebarTrigger({
  className,
  onClick,
  ...props
}: Omit<IconButtonProps, "icon" | "label"> & {
  label?: string;
}): ReactNode {
  const { t } = useTranslation();
  const { toggleSidebar } = useSidebar();
  const { label, ...rest } = props;
  const handleClick = useCallback(
    (event: Parameters<NonNullable<IconButtonProps["onClick"]>>[0]) => {
      onClick?.(event);
      toggleSidebar();
    },
    [onClick, toggleSidebar]
  );
  return (
    <IconButton
      className={className}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      icon={<PanelLeftIcon />}
      label={label ?? t("a11y.toggleSidebar")}
      onClick={handleClick}
      {...rest}
    />
  );
}

export function SidebarInset({
  className,
  ...props
}: ComponentProps<"main">): ReactNode {
  return (
    <main
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-1",
        className
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        // sidebar-foreground-muted is the contrast-checked muted text on the green surface.
        "flex h-8 shrink-0 items-center rounded-xl px-3 font-medium text-caption text-sidebar-foreground-muted transition-[margin,opacity] duration-normal ease-standard group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      data-sidebar="group-label"
      data-slot="sidebar-group-label"
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("w-full text-body-sm", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

export function SidebarSeparator({
  className,
  ...props
}: ComponentProps<"hr">): ReactNode {
  return (
    <hr
      className={cn("mx-2 h-px w-auto border-0 bg-sidebar-border", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: ComponentProps<"ul">): ReactNode {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: ComponentProps<"li">): ReactNode {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button group/menu-button flex min-h-touch w-full items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-left text-body-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&_svg]:size-5 [&_svg]:shrink-0",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[collapsible=icon]:size-touch! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!",
    "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    transition,
    disabled,
  ],
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "",
        outline:
          "bg-sidebar shadow-[0_0_0_1px_var(--color-sidebar-border)] hover:shadow-[0_0_0_1px_var(--color-sidebar-accent)]",
      },
    },
  }
);

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant,
  tooltip,
  className,
  ...props
}: ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  /** Shown beside the button while the sidebar is collapsed to icons. */
  tooltip?: ReactNode;
} & VariantProps<typeof sidebarMenuButtonVariants>): ReactNode {
  const Comp = asChild ? Slot.Root : "button";
  const { isMobile, state } = useSidebar();
  const button = (
    <Comp
      aria-current={isActive ? "page" : undefined}
      className={cn(sidebarMenuButtonVariants({ variant }), className)}
      data-active={isActive}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      {...props}
    />
  );
  if (!tooltip) {
    return button;
  }
  return (
    <Tooltip
      content={tooltip}
      side="right"
      {...(state !== "collapsed" || isMobile ? { open: false } : {})}
    >
      {button}
    </Tooltip>
  );
}
