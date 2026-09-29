/**
 * @fileoverview Inline-editable cell for the gesture admin table.
 *
 * Renders either a plain `<input>` or `<textarea>` that automatically
 * focuses when mounted. Commits the change on blur or Enter, and cancels on Escape.
 *
 * @example
 * <EditableCell
 *   value={gesture.name}
 *   onChange={(v) => updateField("name", v)}
 *   onBlur={() => setEditing(null)}
 * />
 */

import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useRef } from "react";

interface EditableCellProps {
  className?: string;
  /** Render a `<textarea>` instead of `<input>`. */
  multiline?: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
}

const BASE_CLASSES =
  "w-full rounded border border-[var(--admin-accent)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/20";

/**
 * Inline editable cell. Renders a focused input or textarea.
 * Commits on blur / Enter; cancels on Escape.
 */
export function EditableCell({
  value,
  onChange,
  onBlur,
  multiline = false,
  className = "",
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onBlur();
      }
      if (e.key === "Escape") {
        onBlur();
      }
    },
    [onBlur]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === "Enter") {
        onBlur();
      }
      if (e.key === "Escape") {
        onBlur();
      }
    },
    [onBlur]
  );

  if (multiline) {
    return (
      <textarea
        autoFocus
        className={`${BASE_CLASSES} min-h-[60px] resize-none ${className}`}
        onBlur={onBlur}
        onChange={handleChange}
        onKeyDown={handleTextareaKeyDown}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
      />
    );
  }

  return (
    <input
      autoFocus
      className={`${BASE_CLASSES} ${className}`}
      onBlur={onBlur}
      onChange={handleChange}
      onKeyDown={handleInputKeyDown}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
    />
  );
}
