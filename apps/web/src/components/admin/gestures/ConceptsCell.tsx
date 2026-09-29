/**
 * @fileoverview Inline concept tag editor for the gesture admin table.
 *
 * In read mode: renders concept badges. Click to enter edit mode.
 * In edit mode: renders existing tags (click to remove) + an input to add new ones.
 *
 * @example
 * <ConceptsCell
 *   concepts={gesture.concept}
 *   onChange={(concepts) => updateField("concept", concepts)}
 * />
 */

import { Check, X } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ConceptsCellProps {
  concepts: string[];
  onChange: (concepts: string[]) => void;
}

interface ConceptTagProps {
  concept: string;
  onRemove: (concept: string) => void;
}

/** Removable concept tag shown in edit mode. */
function ConceptTag({ concept, onRemove }: ConceptTagProps) {
  const handleClick = useCallback((): void => {
    onRemove(concept);
  }, [concept, onRemove]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRemove(concept);
      }
    },
    [concept, onRemove]
  );

  return (
    <button
      className="inline-flex items-center gap-1 rounded-full border-transparent bg-secondary px-2 py-0.5 font-medium text-secondary-foreground text-xs transition-colors hover:bg-secondary/80"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      type="button"
    >
      {concept}
      <span aria-hidden="true" className="text-xs">
        ×
      </span>
    </button>
  );
}

/**
 * Click-to-edit concept tags cell.
 * Shows badges in read mode; inline add/remove controls in edit mode.
 */
export function ConceptsCell({ concepts, onChange }: ConceptsCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newConcept, setNewConcept] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback((): void => {
    const trimmed = newConcept.trim();
    if (trimmed && !concepts.includes(trimmed)) {
      onChange([...concepts, trimmed]);
      setNewConcept("");
    }
  }, [newConcept, concepts, onChange]);

  const handleRemove = useCallback(
    (concept: string): void => {
      onChange(concepts.filter((c) => c !== concept));
    },
    [concepts, onChange]
  );

  const handleNewConceptChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setNewConcept(e.target.value);
    },
    []
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
      if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleAdd]
  );

  const stopEditing = useCallback((): void => {
    setIsEditing(false);
  }, []);

  const startEditing = useCallback((): void => {
    setIsEditing(true);
  }, []);

  const handleReadKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsEditing(true);
      }
    },
    []
  );

  if (isEditing) {
    return (
      <div className="min-w-[200px] space-y-2">
        <div className="flex flex-wrap gap-1">
          {concepts.map((concept) => (
            <ConceptTag
              concept={concept}
              key={concept}
              onRemove={handleRemove}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            autoFocus
            className="h-7 text-xs"
            onChange={handleNewConceptChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Add concept..."
            ref={inputRef}
            value={newConcept}
          />
        </div>
        <div className="flex gap-1">
          <Button
            className="h-6 px-2 text-xs"
            onClick={handleAdd}
            size="sm"
            variant="ghost"
          >
            <Check className="mr-1 h-3 w-3" />
            Add
          </Button>
          <Button
            className="h-6 px-2 text-xs"
            onClick={stopEditing}
            size="sm"
            variant="ghost"
          >
            <X className="mr-1 h-3 w-3" />
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="flex min-w-[120px] cursor-pointer flex-wrap gap-1 text-left hover:opacity-70"
      onClick={startEditing}
      onKeyDown={handleReadKeyDown}
      type="button"
    >
      {concepts.length === 0 ? (
        <span className="text-[var(--admin-text-muted)] text-xs italic">
          Click to add...
        </span>
      ) : (
        concepts.map((concept) => (
          <Badge className="text-xs" key={concept} variant="outline">
            {concept}
          </Badge>
        ))
      )}
    </button>
  );
}
