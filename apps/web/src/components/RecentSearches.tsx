import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RecentSearchesProps {
  searches: string[];
  onSelect: (search: string) => void;
  onClear?: () => void;
  className?: string;
}

export default function RecentSearches({
  searches,
  onSelect,
  onClear,
  className = "",
}: RecentSearchesProps) {
  const { t } = useTranslation();

  if (searches.length === 0) {
    return null;
  }

  return (
    <div className={`${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-muted-foreground text-sm">
          {t("web.recentSearches.title")}
        </h3>
        {onClear ? (
          <button
            className="text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={onClear}
            type="button"
          >
            {t("web.recentSearches.clear")}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <button
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-foreground text-sm transition-colors hover:bg-muted"
            key={search}
            onClick={() => onSelect(search)}
            type="button"
          >
            <Clock className="h-3 w-3 text-muted-foreground" />
            {search}
          </button>
        ))}
      </div>
    </div>
  );
}
