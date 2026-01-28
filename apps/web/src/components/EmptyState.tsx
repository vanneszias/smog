import { Info } from "lucide-react";

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ message, icon, action }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 text-muted-foreground">
        {icon || <Info className="h-16 w-16" />}
      </div>
      <p className="mb-4 max-w-md text-muted-foreground">{message}</p>
      {action ? (
        <button
          className="rounded-lg px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={action.onClick}
          style={{ backgroundColor: "var(--primary)" }}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
