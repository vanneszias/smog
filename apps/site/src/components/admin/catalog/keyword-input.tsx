import { GESTURE_KEYWORD_MAX, GESTURE_KEYWORDS_MAX } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Button, Chip, Field, Input, Text } from "@smog/ui-web";
import { normalizeText } from "@smog/utils";
import { Plus, X } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react";

type KeywordProblem = "duplicate" | "max" | "tooLong";

/**
 * Adds one typed keyword under the contract's rules (ruling 8): trimmed,
 * at most 60 characters, at most 30, no `normalizeText` duplicate. `null`
 * for an empty entry.
 */
function addKeyword(
  keywords: readonly string[],
  raw: string
): { keywords: string[] } | { problem: KeywordProblem } | null {
  const keyword = raw.trim();
  if (!keyword) {
    return null;
  }
  if (keyword.length > GESTURE_KEYWORD_MAX) {
    return { problem: "tooLong" };
  }
  const key = normalizeText(keyword);
  if (keywords.some((existing) => normalizeText(existing) === key)) {
    return { problem: "duplicate" };
  }
  if (keywords.length >= GESTURE_KEYWORDS_MAX) {
    return { problem: "max" };
  }
  return { keywords: [...keywords, keyword] };
}

export interface KeywordInputProps {
  /** Hides the hint (the table editor's compact dialog keeps it). */
  hint?: ReactNode;
  label: ReactNode;
  onChange: (keywords: string[]) => void;
  value: readonly string[];
}

function KeywordChip({
  fallback,
  keyword,
  onRemove,
}: {
  /** Takes the focus when the last keyword is removed. */
  fallback: RefObject<HTMLInputElement | null>;
  keyword: string;
  onRemove: (keyword: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const remove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // The chip goes away: move the focus to the next one (or the input).
      const item = event.currentTarget.closest("li");
      const next =
        item?.nextElementSibling?.querySelector("button") ??
        item?.previousElementSibling?.querySelector("button") ??
        fallback.current;
      next?.focus();
      onRemove(keyword);
    },
    [fallback, keyword, onRemove]
  );
  return (
    <li>
      <Chip
        aria-label={t("admin.gestures.keywords.remove", { keyword })}
        icon={<X />}
        onClick={remove}
        size="sm"
      >
        {keyword}
      </Chip>
    </li>
  );
}

/**
 * The gesture's keywords ("related concepts"): type one and press Enter or
 * Add; a click on a keyword removes it. The order is kept.
 */
export function KeywordInput({
  hint,
  label,
  onChange,
  value,
}: KeywordInputProps): ReactNode {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<{
    keyword: string;
    kind: KeywordProblem;
  } | null>(null);
  const add = useCallback(() => {
    const result = addKeyword(value, draft);
    if (!result) {
      setDraft("");
      setProblem(null);
      return;
    }
    if ("problem" in result) {
      setProblem({ keyword: draft.trim(), kind: result.problem });
      return;
    }
    setProblem(null);
    setDraft("");
    onChange(result.keywords);
  }, [draft, onChange, value]);
  const onInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    setProblem(null);
  }, []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // Never submit the gesture form around the field.
      if (event.key === "Enter") {
        event.preventDefault();
        add();
      }
    },
    [add]
  );
  const remove = useCallback(
    (keyword: string) => onChange(value.filter((item) => item !== keyword)),
    [onChange, value]
  );
  let error: string | undefined;
  if (problem?.kind === "duplicate") {
    error = t("admin.gestures.keywords.duplicate", {
      keyword: problem.keyword,
    });
  } else if (problem?.kind === "tooLong") {
    error = t("admin.gestures.keywords.tooLong", { max: GESTURE_KEYWORD_MAX });
  } else if (problem?.kind === "max") {
    error = t("admin.gestures.keywords.max", { max: GESTURE_KEYWORDS_MAX });
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field
        error={error}
        hint={hint === undefined ? t("admin.gestures.keywords.hint") : hint}
        label={label}
      >
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            className="min-w-0 flex-1"
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder={t("admin.gestures.keywords.placeholder")}
            ref={inputRef}
            value={draft}
          />
          <Button
            icon={<Plus />}
            onClick={add}
            type="button"
            variant="secondary"
          >
            {t("admin.gestures.keywords.add")}
          </Button>
        </div>
      </Field>
      {value.length > 0 ? (
        <ul
          aria-label={t("admin.gestures.keywords.list", {
            count: value.length,
          })}
          className="flex flex-wrap gap-2"
        >
          {value.map((keyword) => (
            <KeywordChip
              fallback={inputRef}
              key={keyword}
              keyword={keyword}
              onRemove={remove}
            />
          ))}
        </ul>
      ) : (
        <Text size="body-sm" tone="muted">
          {t("admin.gestures.keywords.none")}
        </Text>
      )}
    </div>
  );
}
