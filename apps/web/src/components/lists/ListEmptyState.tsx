import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ListEmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  description?: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="font-bold text-xl">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <Button className="mt-5" onClick={action.onClick} type="button">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function ListLoadingState({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      {label ? <p className="text-muted-foreground text-sm">{label}</p> : null}
    </div>
  );
}
