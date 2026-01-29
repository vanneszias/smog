import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = "",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border border-border ${className}`}
      style={{ backgroundColor: "var(--card)" }}
    >
      <button
        className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/30"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        type="button"
      >
        <h2 className="font-semibold text-xl" style={{ color: "var(--text)" }}>
          {title}
        </h2>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-border border-t px-6 pt-4 pb-6">{children}</div>
      </div>
    </div>
  );
}
