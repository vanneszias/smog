import { Card, CardDescription, CardHeader, CardTitle, cn } from "@smog/ui-web";
import { type ReactNode, useId } from "react";

export interface AccountSectionProps {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
  tone?: "default" | "danger";
}

/** One account page section: a card named by its heading (a landmark). */
export function AccountSection({
  children,
  className,
  description,
  title,
  tone = "default",
}: AccountSectionProps): ReactNode {
  const titleId = useId();
  return (
    <Card
      aria-labelledby={titleId}
      className={cn(
        "gap-4",
        tone === "danger" && "border-danger-subtle",
        className
      )}
      role="region"
    >
      <CardHeader>
        <CardTitle id={titleId} level={2}>
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children}
    </Card>
  );
}

/** A row inside a section: what it is on the left, its action on the right. */
export function AccountRow({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3 border-border-subtle border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2 font-medium text-body">
          {title}
        </div>
        {description ? (
          <p className="text-body-sm text-foreground-muted">{description}</p>
        ) : null}
        {children}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      ) : null}
    </div>
  );
}
