import { OTPInput, OTPInputContext } from "input-otp";
import { MinusIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useContext } from "react";
import { cn } from "../lib/cn";
import { useFieldControl } from "./field";

/**
 * A one-time code field (registry `input-otp`): one box per character over a
 * single real input, so paste, autofill (`autoComplete="one-time-code"`) and
 * screen readers see one text field. Name it with a Field label or
 * `aria-label`.
 */
export function InputOTP({
  className,
  containerClassName,
  ...rest
}: ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}): ReactNode {
  // The Field's id, description and invalid state, like `Input`.
  const { invalid: _invalid, ...props } = useFieldControl(rest);
  return (
    <OTPInput
      className={cn("disabled:cursor-not-allowed", className)}
      containerClassName={cn(
        "flex items-center gap-2 has-disabled:opacity-50",
        containerClassName
      )}
      data-slot="input-otp"
      spellCheck={false}
      {...props}
    />
  );
}

export function InputOTPGroup({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "flex items-center rounded-4xl has-aria-invalid:border-destructive",
        className
      )}
      data-slot="input-otp-group"
      {...props}
    />
  );
}

export function InputOTPSlot({
  index,
  className,
  ...props
}: ComponentProps<"div"> & {
  index: number;
}): ReactNode {
  const inputOTPContext = useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};
  return (
    <div
      className={cn(
        "relative flex size-touch items-center justify-center border-input border-y border-r bg-card text-body outline-none transition-all first:rounded-l-4xl first:border-l last:rounded-r-4xl aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-2 data-[active=true]:ring-ring motion-reduce:transition-none",
        className
      )}
      data-active={isActive}
      data-slot="input-otp-slot"
      {...props}
    >
      {char}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000 motion-reduce:animate-none" />
        </div>
      ) : null}
    </div>
  );
}

export function InputOTPSeparator({
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      data-slot="input-otp-separator"
      {...props}
    >
      <MinusIcon aria-hidden="true" />
    </div>
  );
}
