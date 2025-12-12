import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "../ui/input";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = "Search gestures...",
  autoFocus = false,
  className = "",
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleClear = () => {
    onChange("");
    if (onClear) {
      onClear();
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      onSubmit(value);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
      <Input
        className="h-12 pr-10 pl-10 text-base"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
      />
      {value.length > 0 && (
        <button
          className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleClear}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
