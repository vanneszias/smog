import { zodResolver } from "@hookform/resolvers/zod";
import { Slot } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  type UseFormProps,
  type UseFormReturn,
  useForm,
  useFormContext,
  useFormState,
} from "react-hook-form";
import type { z } from "zod";
import { cn } from "../lib/cn";
import { Label } from "./label";

/**
 * Forms (registry `form`: react-hook-form). `Form` is the provider; each
 * control sits in a `FormField` > `FormItem` with a `FormLabel`, a
 * `FormControl` (a Slot that wires `id`, `aria-describedby` and
 * `aria-invalid` into the kit control inside it, the same wiring `Field`
 * gives through `useFieldControl`), a `FormDescription` and a `FormMessage`.
 */
export const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

interface FormItemContextValue {
  id: string;
}

const FormItemContext = createContext<FormItemContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>): ReactNode {
  const value = useMemo(() => ({ name: props.name }), [props.name]);
  return (
    <FormFieldContext.Provider value={value}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/** The ids and error state of the surrounding `FormField` + `FormItem`. */
export function useFormField(): {
  error: ReturnType<
    ReturnType<typeof useFormContext>["getFieldState"]
  >["error"];
  formDescriptionId: string;
  formItemId: string;
  formMessageId: string;
  id: string;
  invalid: boolean;
  name: string;
} {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext?.name });
  if (!(fieldContext && itemContext)) {
    throw new Error(
      "[ui-web] useFormField must be used inside <FormField> and <FormItem>"
    );
  }
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;
  return {
    error: fieldState.error,
    formDescriptionId: `${id}-form-item-description`,
    formItemId: `${id}-form-item`,
    formMessageId: `${id}-form-item-message`,
    id,
    invalid: fieldState.invalid,
    name: fieldContext.name,
  };
}

export function FormItem({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  const id = useId();
  const value = useMemo(() => ({ id }), [id]);
  return (
    <FormItemContext.Provider value={value}>
      <div
        className={cn("grid gap-2", className)}
        data-slot="form-item"
        {...props}
      />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: ComponentProps<typeof Label>): ReactNode {
  const { error, formItemId } = useFormField();
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: FormControl receives the same formItemId through context.
    <Label
      className={cn("data-[error=true]:text-danger-strong", className)}
      data-error={Boolean(error)}
      data-slot="form-label"
      htmlFor={formItemId}
      {...props}
    />
  );
}

export function FormControl(
  props: ComponentProps<typeof Slot.Root>
): ReactNode {
  const { error, formDescriptionId, formItemId, formMessageId } =
    useFormField();
  return (
    <Slot.Root
      aria-describedby={
        error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId
      }
      aria-invalid={Boolean(error)}
      data-slot="form-control"
      id={formItemId}
      {...props}
    />
  );
}

export function FormDescription({
  className,
  ...props
}: ComponentProps<"p">): ReactNode {
  const { formDescriptionId } = useFormField();
  return (
    <p
      className={cn("text-body-sm text-muted-foreground", className)}
      data-slot="form-description"
      id={formDescriptionId}
      {...props}
    />
  );
}

/** The field's error (from the resolver), `role="alert"`; or its children. */
export function FormMessage({
  className,
  children,
  ...props
}: ComponentProps<"p">): ReactNode {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? "") : children;
  if (!body) {
    return null;
  }
  return (
    <p
      className={cn("text-body-sm text-danger-strong", className)}
      data-slot="form-message"
      id={formMessageId}
      role={error ? "alert" : undefined}
      {...props}
    >
      {body}
    </p>
  );
}

/**
 * `useForm` with the zod resolver: the schema is the single source of the
 * form's types and messages (the screens' schemas live in the feature
 * packages' `./schema`).
 */
export function useZodForm<
  TInput extends FieldValues,
  TOutput extends FieldValues,
>(
  schema: z.ZodType<TOutput, TInput>,
  props?: Omit<UseFormProps<TInput, unknown, TOutput>, "resolver">
): UseFormReturn<TInput, unknown, TOutput> {
  return useForm<TInput, unknown, TOutput>({
    ...props,
    resolver: zodResolver(schema),
  });
}
