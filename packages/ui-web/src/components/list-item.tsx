import { Slot } from "radix-ui";
import {
  type ComponentProps,
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, stateLayer, transition } from "../lib/variants";

export interface ListItemProps
  extends Omit<ComponentProps<"div">, "title" | "onClick"> {
  /** Web only: render the single child (a link) as the row. */
  asChild?: boolean;
  description?: ReactNode;
  disabled?: boolean;
  /** Leading media: an icon, an Avatar or a thumbnail. */
  leading?: ReactNode;
  /** Makes the whole row a button. */
  onClick?: MouseEventHandler<HTMLElement>;
  title: ReactNode;
  /** Trailing content: a Badge, a chevron, a Switch (not with onClick). */
  trailing?: ReactNode;
}

const rowClasses =
  "relative flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left text-foreground";

/** One row of a list: leading media, a title, a description and trailing content. */
export function ListItem({
  asChild = false,
  children,
  className,
  description,
  disabled: isDisabled,
  leading,
  onClick,
  title,
  trailing,
  ...props
}: ListItemProps): ReactNode {
  const content = (
    <>
      {leading ? (
        <span className="relative flex shrink-0 items-center text-foreground-muted">
          {leading}
        </span>
      ) : null}
      <span className="relative flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-body">{title}</span>
        {description ? (
          <span className="truncate text-body-sm text-foreground-muted">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="relative flex shrink-0 items-center gap-2 text-foreground-muted">
          {trailing}
        </span>
      ) : null}
    </>
  );
  const interactive = cn(rowClasses, stateLayer.none, focusRing, transition);
  if (asChild && isValidElement(children)) {
    // The child (a link) becomes the row and gets the row's content.
    return (
      <Slot.Root className={cn(interactive, className)} {...props}>
        {cloneElement(children, undefined, content)}
      </Slot.Root>
    );
  }
  if (onClick) {
    return (
      <button
        className={cn(interactive, disabled, className)}
        disabled={isDisabled}
        onClick={onClick}
        type="button"
        {...(props as ComponentProps<"button">)}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cn(rowClasses, className)} {...props}>
      {content}
    </div>
  );
}
