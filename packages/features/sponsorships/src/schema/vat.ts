/**
 * The Belgian enterprise / VAT number of an invoice request (ruling 3), as
 * the old wizard checked it: strip spaces and dots, 10 digits, and the last
 * two digits equal `97 - (first 8 digits % 97)`. A leading `BE` (any case)
 * is accepted and stripped, because Belgian users type it. Stored as the 10
 * digits.
 */
import { z } from "zod";

const SEPARATORS = /[\s.]/g;
const BE_PREFIX = /^be/i;
const TEN_DIGITS = /^\d{10}$/;

/** The 10 digits of a valid number, or `null`. */
export function normalizeBelgianVat(input: string): string | null {
  const digits = input.replace(SEPARATORS, "").replace(BE_PREFIX, "");
  if (!TEN_DIGITS.test(digits)) {
    return null;
  }
  const first8 = Number.parseInt(digits.slice(0, 8), 10);
  const check = Number.parseInt(digits.slice(8), 10);
  return 97 - (first8 % 97) === check ? digits : null;
}

/** A VAT number as typed; parses to the normalised 10 digits. */
export const vatNumberSchema = z
  .string()
  .max(32)
  .transform((value, context) => {
    const normalized = normalizeBelgianVat(value);
    if (normalized === null) {
      context.addIssue({ code: "custom", message: "invalidVat" });
      return z.NEVER;
    }
    return normalized;
  });
