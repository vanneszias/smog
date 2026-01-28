import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface GestureCardProps {
  title: string;
  onClick?: () => void;
  illustration?: ReactNode;
  className?: string;
}

export function GestureCard({
  title,
  onClick,
  illustration,
  className = "",
}: GestureCardProps) {
  return (
    <button
      className={`group w-full cursor-pointer overflow-hidden rounded-lg bg-card shadow-sm transition-all hover:shadow-md ${className}`}
      onClick={onClick}
      type="button"
    >
      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <div className="flex h-full items-center justify-center">
          {illustration || (
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-border/50 border-t bg-card p-3">
        <span className="text-foreground text-sm">{title}</span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
        />
      </div>
    </button>
  );
}
