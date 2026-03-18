/**
 * @fileoverview Validation utilities for the sponsorship wizard.
 *
 * Provides pure validation functions for each form field and step.
 * All functions are side-effect-free and fully unit-testable.
 */

/**
 * Validate a Belgian ondernemingsnummer (company registration number / VAT number).
 *
 * Format: 10 digits. The last 2 digits must equal `97 - (first 8 digits % 97)`.
 * Spaces and dots are stripped before validation.
 *
 * @param value - Raw VAT number string (may include spaces or dots).
 * @returns `true` if the number is valid.
 *
 * @example
 * validateVatNumber("0123456749") // true
 * validateVatNumber("0000000000") // false
 */
export function validateVatNumber(value: string): boolean {
  const digits = value.replace(/[\s.]/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }
  const first8 = Number.parseInt(digits.slice(0, 8), 10);
  const checkDigits = Number.parseInt(digits.slice(8), 10);
  return 97 - (first8 % 97) === checkDigits;
}

/**
 * Validate an email address with a simple regex.
 *
 * @param email - Email string to validate.
 * @returns `true` if the email looks valid.
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Shape of the sponsor details form data used by `validateDetails`. */
export interface SponsorDetailsFormData {
  sponsorName: string;
  includeLogo: boolean;
  logoFile: File | null;
  contactFullName: string;
  contactEmail: string;
  invoiceRequested: boolean;
  invoiceName: string;
  invoiceVatNumber: string;
  invoiceEmail: string;
}

/** Field-level error map for the sponsor details form. Includes 'logo' for the file upload field. */
export type SponsorDetailsErrors = Partial<
  Record<keyof SponsorDetailsFormData | "logo", string>
>;

/**
 * Validate invoice-specific fields.
 * Called when `invoiceRequested` is `true`.
 *
 * @param data - Partial form data containing invoice fields.
 * @param t - i18n translate function.
 * @param errors - Mutable error map to populate.
 */
export function validateInvoiceFields(
  data: Pick<
    SponsorDetailsFormData,
    "invoiceName" | "invoiceVatNumber" | "invoiceEmail"
  >,
  t: (key: string) => string,
  errors: Record<string, string | undefined>
): void {
  if (!data.invoiceName.trim()) {
    errors.invoiceName = t("web.sponsors.wizard.errors.invoiceNameRequired");
  }
  if (!data.invoiceVatNumber.trim()) {
    errors.invoiceVatNumber = t(
      "web.sponsors.wizard.errors.invoiceVatRequired"
    );
  } else if (!validateVatNumber(data.invoiceVatNumber)) {
    errors.invoiceVatNumber = t("web.sponsors.wizard.errors.invoiceVatInvalid");
  }
  if (!data.invoiceEmail.trim()) {
    errors.invoiceEmail = t("web.sponsors.wizard.errors.invoiceEmailRequired");
  } else if (!validateEmail(data.invoiceEmail)) {
    errors.invoiceEmail = t("web.sponsors.wizard.errors.invoiceEmailInvalid");
  }
}

/**
 * Validate the sponsor details step of the wizard.
 *
 * @param data - Current form values.
 * @param t - i18n translate function.
 * @returns `{ isValid, errors }` — `errors` is empty when `isValid` is `true`.
 *
 * @example
 * const { isValid, errors } = validateDetails(formData, t);
 * if (!isValid) setErrors(errors);
 */
export function validateDetails(
  data: SponsorDetailsFormData,
  t: (key: string) => string
): { isValid: boolean; errors: SponsorDetailsErrors } {
  const errors: Record<string, string | undefined> = {};

  if (!data.sponsorName.trim()) {
    errors.sponsorName = t("web.sponsors.new.validation.sponsorNameRequired");
  } else if (data.sponsorName.length > 35) {
    errors.sponsorName = t("web.sponsors.new.validation.sponsorNameTooLong");
  }

  if (data.includeLogo && !data.logoFile) {
    errors.logo = t("web.sponsors.new.validation.logoRequired");
  }

  if (!data.contactFullName.trim()) {
    errors.contactFullName = t("web.sponsors.wizard.errors.fullNameRequired");
  }

  if (!data.contactEmail.trim()) {
    errors.contactEmail = t("web.sponsors.wizard.errors.emailRequired");
  } else if (!validateEmail(data.contactEmail)) {
    errors.contactEmail = t("web.sponsors.wizard.errors.emailInvalid");
  }

  if (data.invoiceRequested) {
    validateInvoiceFields(data, t, errors);
  }

  return {
    isValid:
      Object.keys(errors).filter((k) => errors[k] !== undefined).length === 0,
    errors: errors as SponsorDetailsErrors,
  };
}
