import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface FeatureCardProps {
  icon: LucideIcon;
  iconBgColor?: string;
  title: string;
  description: string | ReactNode;
  className?: string;
}

export function FeatureCard({
  icon: Icon,
  iconBgColor = "from-primary to-primary/80",
  title,
  description,
  className = "",
}: FeatureCardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${iconBgColor}`}
      >
        <Icon
          aria-label={`${title} icon`}
          className="h-6 w-6 text-white"
          role="img"
        />
      </div>
      <h4 className="mb-2 font-semibold text-foreground text-sm">{title}</h4>
      <div className="text-muted-foreground text-xs leading-relaxed">
        {description}
      </div>
    </div>
  );
}
