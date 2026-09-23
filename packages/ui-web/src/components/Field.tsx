import {
  Children,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";
import { cn } from "../lib/cn";
import { Label } from "./Label";

/**
 * The props `Field` writes onto whatever control it wraps.
 *
 * Every control in this package accepts them, because they are plain DOM
 * attributes — so `Field` works over an `Input`, a `Textarea`, a `Checkbox`,
 * a `SelectTrigger` or a bare `<input>` without knowing which it has.
 */
interface FieldControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** The visible label. Always rendered; a field without one is not a field. */
  label: ReactNode;
  /**
   * The control's id. Defaults to the child's own `id`, and to a generated one
   * when the child has none.
   */
  htmlFor?: string;
  /** Persistent guidance. Stays put when an error appears. */
  help?: ReactNode;
  /** Validation message. Its presence is what marks the control invalid. */
  error?: ReactNode;
  /** Exactly one control. */
  children: ReactElement<FieldControlProps>;
};

/**
 * Label, control, help text and error, wired together.
 *
 * This exists so that an accessible field is what you get by default rather
 * than what each page remembers to assemble. Three associations have to hold
 * at once, and all three are invisible when broken:
 *
 * 1. the label names the control (`htmlFor` → the control's `id`);
 * 2. the help text and the error are both reachable from the control's
 *    `aria-describedby`;
 * 3. `aria-invalid` is set while, and only while, there is an error.
 *
 * **Both messages are kept.** The usual pattern has the error replace the
 * help text; this does not. A hint like "minimaal acht tekens" is most needed at
 * the moment the value is wrong, and dropping it there is the same bug as an
 * `aria-describedby` that overwrites instead of appending — which is why
 * `Field.test.tsx` walks the ids and reads the text back rather than comparing
 * id strings.
 *
 * Ids are generated with `useId` and derived from that one value, so two
 * fields on a page never collide and a caller's own `id` is always preferred
 * over a generated one.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, htmlFor, help, error, children, ...props }, ref) => {
    const generatedId = useId();
    const control = Children.only(children);
    const controlId = htmlFor ?? control.props.id ?? `${generatedId}-control`;
    const helpId = `${generatedId}-help`;
    const errorId = `${generatedId}-error`;

    const describedBy =
      [
        control.props["aria-describedby"],
        help == null ? null : helpId,
        error == null ? null : errorId,
      ]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div
        className={cn("flex flex-col gap-2", className)}
        ref={ref}
        {...props}
      >
        <Label htmlFor={controlId}>{label}</Label>
        {cloneElement(control, {
          id: controlId,
          "aria-describedby": describedBy,
          "aria-invalid": error == null ? control.props["aria-invalid"] : true,
        })}
        {help == null ? null : (
          <p className="text-foreground-muted text-sm" id={helpId}>
            {help}
          </p>
        )}
        {error == null ? null : (
          <p className="font-medium text-danger text-sm" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Field.displayName = "Field";
