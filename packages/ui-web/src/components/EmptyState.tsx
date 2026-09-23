import { cva } from "class-variance-authority";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

export const emptyStateVariants = cva(
  "flex flex-col items-center gap-3 rounded-lg border border-border-subtle border-dashed p-12 text-center"
);

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  /** Decorative; hidden from assistive technology. */
  icon?: ReactNode;
  /** Always rendered, as a heading. An empty state without one says nothing. */
  title: ReactNode;
  description?: ReactNode;
  /** Usually a `Button` — the way out of the empty state. */
  action?: ReactNode;
};

/**
 * What a list looks like when it has nothing in it.
 *
 * `role="status"`, because the common case is a filter that has just emptied
 * the results: without it a keyboard user tabs into a region that has
 * silently changed under them. The icon is decoration and is hidden; the
 * title carries the message.
 *
 * The edge is dashed and `border-subtle` — it outlines where content would be
 * rather than delimiting a control, so it is decoration by the definition in
 * `packages/styles/src/tokens.ts`.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    // biome-ignore lint/a11y/useSemanticElements: <output> takes phrasing content only, and this region holds a heading and a paragraph — the suggested element cannot legally contain what an empty state is made of. A polite live region on a div is what is wanted, and that is all role="status" is.
    <div
      className={cn(emptyStateVariants(), className)}
      ref={ref}
      role="status"
      {...props}
    >
      {icon == null ? null : (
        <span aria-hidden="true" className="text-foreground-muted">
          {icon}
        </span>
      )}
      <h3 className="font-semibold text-foreground text-lg">{title}</h3>
      {description == null ? null : (
        <p className="max-w-sm text-foreground-muted text-sm">{description}</p>
      )}
      {action == null ? null : <div className="pt-2">{action}</div>}
    </div>
  )
);

EmptyState.displayName = "EmptyState";
