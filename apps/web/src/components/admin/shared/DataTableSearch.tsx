/**
 * @fileoverview Reusable search/filter input for admin data tables.
 *
 * @example
 * <DataTableSearch
 *   query={searchQuery}
 *   onQueryChange={setSearchQuery}
 *   placeholder="Zoek op naam..."
 * />
 */

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface DataTableSearchProps {
  /** Current search query string. */
  query: string;
  /** Called when the query changes. */
  onQueryChange: (query: string) => void;
  /** Input placeholder text. */
  placeholder?: string;
  /** Optional additional CSS classes. */
  className?: string;
}

/**
 * Search input with a clear button for admin data tables.
 *
 * Shows a magnifying glass icon on the left and an ×-button on the right
 * when the query is non-empty.
 */
export function DataTableSearch({
  query,
  onQueryChange,
  placeholder = "Zoeken...",
  className,
}: DataTableSearchProps) {
  return (
    <div className={`relative flex items-center ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <Input
        className="pr-8 pl-9"
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        value={query}
      />
      {query && (
        <button
          aria-label="Zoekopdracht wissen"
          className="absolute right-3 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => onQueryChange("")}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
