import { useTranslation } from "@smog/i18n/react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from "react";
import { cn } from "../lib/cn";

interface FieldContextValue {
  /** Ids of the hint, error and counter, for `aria-describedby`. */
  describedBy: string | undefined;
  id: string;
  invalid: boolean;
  labelId: string;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface ControlProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  id?: string;
  invalid?: boolean;
  required?: boolean;
}

/**
 * The props a control takes from its Field (id, description, invalid,
 * required), merged under the control's own props.
 */
export function useFieldControl<P extends ControlProps>(
  props: P
): P & { invalid: boolean } {
  const field = useContext(FieldContext);
  const invalid = props.invalid ?? field?.invalid ?? false;
  const describedBy = [field?.describedBy, props["aria-describedby"]]
    .filter(Boolean)
    .join(" ");
  return {
    ...props,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": invalid || props["aria-invalid"] || undefined,
    id: props.id ?? field?.id,
    invalid,
    required: props.required ?? (field?.required || undefined),
  };
}

/** The Field's label id, for controls that are groups (RadioGroup). */
export function useFieldLabelId(): string | undefined {
  return useContext(FieldContext)?.labelId;
}

export interface FieldProps extends Omit<ComponentProps<"div">, "children"> {
  children: ReactNode;
  /** A live `count/max` counter under the control (e.g. a display name). */
  counter?: { count: number; max: number };
  /** The error message; marks the control invalid. */
  error?: ReactNode;
  hint?: ReactNode;
  /** Overrides the generated control id. */
  id?: string;
  label: ReactNode;
  /** Adds "Optional" to the label (`kit.optional`). */
  optional?: boolean;
  required?: boolean;
}

/** Label + control + hint + error, wired for assistive tech. */
export function Field({
  children,
  className,
  counter,
  error,
  hint,
  id,
  label,
  optional = false,
  required = false,
  ...props
}: FieldProps): ReactNode {
  const { t } = useTranslation();
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const hintId = hint ? `${generated}-hint` : undefined;
  const errorId = error ? `${generated}-error` : undefined;
  const counterId = counter ? `${generated}-counter` : undefined;
  const value: FieldContextValue = {
    describedBy:
      [errorId, hintId, counterId].filter(Boolean).join(" ") || undefined,
    id: controlId,
    invalid: Boolean(error),
    labelId: `${generated}-label`,
    required,
  };
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1", className)} {...props}>
        <label
          className="flex items-baseline gap-2 font-medium text-body-sm text-foreground"
          htmlFor={controlId}
          id={value.labelId}
        >
          <span>{label}</span>
          {optional ? (
            <span className="font-regular text-caption text-foreground-muted">
              {t("kit.optional")}
            </span>
          ) : null}
        </label>
        {children}
        {error ? (
          <p
            className="text-body-sm text-danger-strong"
            id={errorId}
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {hint || counter ? (
          <div className="flex items-start justify-between gap-4">
            {hint ? (
              <p className="text-body-sm text-foreground-muted" id={hintId}>
                {hint}
              </p>
            ) : (
              <span />
            )}
            {counter ? (
              <p
                className={cn(
                  "shrink-0 text-caption tabular-nums",
                  counter.count > counter.max
                    ? "text-danger-strong"
                    : "text-foreground-muted"
                )}
                id={counterId}
              >
                <span aria-hidden="true">
                  {t("kit.characterCount", counter)}
                </span>
                <span className="sr-only">
                  {t("a11y.characterCount", counter)}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
