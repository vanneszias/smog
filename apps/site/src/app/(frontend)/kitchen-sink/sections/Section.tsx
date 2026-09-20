import { cn } from "@smog/ui-web";
import type { ReactNode } from "react";

/**
 * The kitchen sink's own furniture.
 *
 * Deliberately plain: if the frame around a specimen were itself elaborate,
 * a reviewer could not tell whether a spacing that looks wrong belongs to the
 * component or to the page showing it. Everything here is a heading, a label
 * and a gap on a declared step.
 */
export function Section({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-16 flex-col gap-6"
      id={id}
    >
      <h2
        className="border-border-subtle border-b pb-2 font-semibold text-foreground text-xl"
        id={`${id}-heading`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One row of specimens under a label saying what varies across it. */
export function Specimen({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-foreground-muted text-xs uppercase tracking-wide">
        {label}
      </p>
      <div className={cn("flex flex-wrap items-start gap-3", className)}>
        {children}
      </div>
    </div>
  );
}

/** A note a reviewer needs in front of the thing it is about. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-foreground-muted text-sm">{children}</p>;
}
