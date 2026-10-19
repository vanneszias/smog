/**
 * Money is integer cents end to end (phase 6 ruling 3). Mollie's amounts
 * are strings with exactly two decimals (`"50.00"`); these two functions
 * are the only crossing, and neither goes through a float.
 */

const MOLLIE_VALUE = /^\d+\.\d{2}$/;

/** `5000` → `"50.00"`. Refuses anything but a non-negative safe integer. */
export function centsToMollieValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(
      `[payments] An amount must be a non-negative integer of cents, got ${cents}`
    );
  }
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * `"50.00"` → `5000`. Only `^\d+\.\d{2}$` is accepted: `"50"`, `"50.0"`,
 * `"-1.00"` and `"1e3"` are refused, and so is a value past a safe integer.
 */
export function mollieValueToCents(value: string): number {
  if (!MOLLIE_VALUE.test(value)) {
    throw new RangeError(
      `[payments] Not a Mollie amount (two decimals): ${JSON.stringify(value)}`
    );
  }
  // The pattern leaves exactly two decimals: dropping the dot is × 100.
  const cents = Number.parseInt(value.replace(".", ""), 10);
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `[payments] A Mollie amount is too large: ${JSON.stringify(value)}`
    );
  }
  return cents;
}
