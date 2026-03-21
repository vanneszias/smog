/**
 * @fileoverview Tests for sponsorship wizard validation utilities.
 *
 * Run with: bun -F web test
 */

import { describe, expect, it } from "vitest";
import {
  validateDetails,
  validateEmail,
  validateVatNumber,
} from "../routes/sponsors/utils/-validation";

// ─── validateVatNumber ────────────────────────────────────────────────────────

describe("validateVatNumber", () => {
  it("accepts a valid 10-digit Belgian number", () => {
    // Check digit: 97 - (01234567 % 97) = 97 - 87 = 10 → last 2 digits = 10
    // Using a well-known valid number format
    expect(validateVatNumber("0123456749")).toBe(true);
  });

  it("rejects non-numeric input", () => {
    expect(validateVatNumber("ABC123")).toBe(false);
  });

  it("rejects a number with wrong check digits", () => {
    expect(validateVatNumber("0123456700")).toBe(false);
  });

  it("rejects a number with fewer than 10 digits", () => {
    expect(validateVatNumber("012345")).toBe(false);
  });

  it("rejects a number with more than 10 digits", () => {
    expect(validateVatNumber("01234567890")).toBe(false);
  });

  it("strips spaces and dots before validating", () => {
    // Same as valid number above but with formatting
    expect(validateVatNumber("0123.456.749")).toBe(true);
    expect(validateVatNumber("0123 456 749")).toBe(true);
  });

  it("rejects all zeros", () => {
    expect(validateVatNumber("0000000000")).toBe(false);
  });
});

// ─── validateEmail ────────────────────────────────────────────────────────────

describe("validateEmail", () => {
  it("accepts a standard email", () => {
    expect(validateEmail("hello@example.com")).toBe(true);
  });

  it("accepts a subdomain email", () => {
    expect(validateEmail("user@mail.company.org")).toBe(true);
  });

  it("rejects an email without @", () => {
    expect(validateEmail("notanemail")).toBe(false);
  });

  it("rejects an email without domain", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  it("rejects an email with spaces", () => {
    expect(validateEmail("user @example.com")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validateEmail("")).toBe(false);
  });
});

// ─── validateDetails ─────────────────────────────────────────────────────────

const t = (key: string) => key; // passthrough for tests

const baseValidData = {
  sponsorName: "ACME Corp",
  includeLogo: false,
  logoFile: null,
  contactFullName: "Jan Jansen",
  contactEmail: "jan@example.com",
  invoiceRequested: false,
  invoiceName: "",
  invoiceVatNumber: "",
  invoiceEmail: "",
};

describe("validateDetails", () => {
  it("passes with valid data", () => {
    const { isValid } = validateDetails(baseValidData, t);
    expect(isValid).toBe(true);
  });

  it("fails when sponsorName is empty", () => {
    const { isValid, errors } = validateDetails(
      { ...baseValidData, sponsorName: "" },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.sponsorName).toBeDefined();
  });

  it("fails when sponsorName exceeds 35 characters", () => {
    const { isValid, errors } = validateDetails(
      { ...baseValidData, sponsorName: "A".repeat(36) },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.sponsorName).toBeDefined();
  });

  it("fails when logo is required but not provided", () => {
    const { isValid, errors } = validateDetails(
      { ...baseValidData, includeLogo: true, logoFile: null },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.logo).toBeDefined();
  });

  it("passes when logo is included and file is provided", () => {
    const { isValid } = validateDetails(
      {
        ...baseValidData,
        includeLogo: true,
        logoFile: new File([""], "logo.png", { type: "image/png" }),
      },
      t
    );
    expect(isValid).toBe(true);
  });

  it("fails when contactFullName is empty", () => {
    const { isValid, errors } = validateDetails(
      { ...baseValidData, contactFullName: "" },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.contactFullName).toBeDefined();
  });

  it("fails when contactEmail is invalid", () => {
    const { isValid, errors } = validateDetails(
      { ...baseValidData, contactEmail: "notanemail" },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.contactEmail).toBeDefined();
  });

  it("validates invoice fields when invoiceRequested is true", () => {
    const { isValid, errors } = validateDetails(
      {
        ...baseValidData,
        invoiceRequested: true,
        invoiceName: "",
        invoiceVatNumber: "",
        invoiceEmail: "",
      },
      t
    );
    expect(isValid).toBe(false);
    expect(errors.invoiceName).toBeDefined();
    expect(errors.invoiceVatNumber).toBeDefined();
    expect(errors.invoiceEmail).toBeDefined();
  });

  it("passes invoice validation with valid invoice data", () => {
    const { isValid } = validateDetails(
      {
        ...baseValidData,
        invoiceRequested: true,
        invoiceName: "ACME BV",
        invoiceVatNumber: "0123456749",
        invoiceEmail: "factuur@acme.be",
      },
      t
    );
    expect(isValid).toBe(true);
  });

  it("skips invoice validation when invoiceRequested is false", () => {
    const { isValid } = validateDetails(
      {
        ...baseValidData,
        invoiceRequested: false,
        invoiceName: "",
        invoiceVatNumber: "invalid",
        invoiceEmail: "invalid",
      },
      t
    );
    expect(isValid).toBe(true);
  });
});
