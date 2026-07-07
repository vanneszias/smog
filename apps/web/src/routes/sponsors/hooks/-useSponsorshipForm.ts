/**
 * @fileoverview Form state management for the sponsorship wizard.
 *
 * Manages all form fields, validation, and step transitions for the
 * three-step sponsorship wizard (select → details → preview).
 *
 * @example
 * const form = useSponsorshipForm();
 * form.setSponsorName("ACME Corp");
 * const ok = form.validateDetails(t);
 */

import { useCallback, useState } from "react";
import type { SponsorDetailsErrors } from "../utils/-validation";
import { validateDetails } from "../utils/-validation";

type WizardStep = "select" | "details" | "preview";

export interface SponsorshipFormState {
  // Wizard navigation
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;

  // Gesture selection
  selectedGestureIds: string[];
  setSelectedGestureIds: React.Dispatch<React.SetStateAction<string[]>>;
  handleToggleSelection: (gestureId: string) => void;

  // Sponsor info
  sponsorName: string;
  setSponsorName: (v: string) => void;
  includeLogo: boolean;
  setIncludeLogo: (v: boolean) => void;
  logoFile: File | null;
  setLogoFile: (v: File | null) => void;
  logoPreview: string | null;
  setLogoPreview: (v: string | null) => void;

  // Contact info
  contactFullName: string;
  setContactFullName: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  contactCompany: string;
  setContactCompany: (v: string) => void;

  // Invoice
  invoiceRequested: boolean;
  setInvoiceRequested: (v: boolean) => void;
  invoiceName: string;
  setInvoiceName: (v: string) => void;
  invoiceVatNumber: string;
  setInvoiceVatNumber: (v: string) => void;
  invoiceEmail: string;
  setInvoiceEmail: (v: string) => void;

  // Validation
  errors: SponsorDetailsErrors;
  setErrors: React.Dispatch<React.SetStateAction<SponsorDetailsErrors>>;
  /**
   * Run validation against the current form state.
   * @param t - i18n translate function.
   * @returns `true` if the form is valid.
   */
  runValidateDetails: (t: (key: string) => string) => boolean;

  // Preview state
  previewPlaybackIds: string[];
  setPreviewPlaybackIds: (ids: string[]) => void;
  isGeneratingPreview: boolean;
  setIsGeneratingPreview: (v: boolean) => void;
  previewProgress: number;
  setPreviewProgress: (v: number) => void;

  // Payment state
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  paymentProgress: number;
  setPaymentProgress: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Central form state hook for the sponsorship wizard.
 *
 * Owns all form field state and exposes typed setters and validators
 * so the wizard steps remain thin presentation components.
 */
export function useSponsorshipForm(): SponsorshipFormState {
  // Wizard step
  const [currentStep, setCurrentStep] = useState<WizardStep>("select");

  // Gesture selection
  const [selectedGestureIds, setSelectedGestureIds] = useState<string[]>([]);

  // Sponsor info
  const [sponsorName, setSponsorName] = useState("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Contact info
  const [contactFullName, setContactFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");

  // Invoice
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceVatNumber, setInvoiceVatNumber] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  // Validation
  const [errors, setErrors] = useState<SponsorDetailsErrors>({});

  // Preview
  const [previewPlaybackIds, setPreviewPlaybackIds] = useState<string[]>([]);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  // Payment
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentProgress, setPaymentProgress] = useState(0);

  const handleToggleSelection = useCallback((gestureId: string) => {
    setSelectedGestureIds((prev) =>
      prev.includes(gestureId)
        ? prev.filter((id) => id !== gestureId)
        : [...prev, gestureId]
    );
  }, []);

  const runValidateDetails = useCallback(
    (t: (key: string) => string): boolean => {
      const { isValid, errors: newErrors } = validateDetails(
        {
          sponsorName,
          includeLogo,
          logoFile,
          contactFullName,
          contactEmail,
          invoiceRequested,
          invoiceName,
          invoiceVatNumber,
          invoiceEmail,
        },
        t
      );
      setErrors(newErrors);
      return isValid;
    },
    [
      sponsorName,
      includeLogo,
      logoFile,
      contactFullName,
      contactEmail,
      invoiceRequested,
      invoiceName,
      invoiceVatNumber,
      invoiceEmail,
    ]
  );

  return {
    currentStep,
    setCurrentStep,
    selectedGestureIds,
    setSelectedGestureIds,
    handleToggleSelection,
    sponsorName,
    setSponsorName,
    includeLogo,
    setIncludeLogo,
    logoFile,
    setLogoFile,
    logoPreview,
    setLogoPreview,
    contactFullName,
    setContactFullName,
    contactEmail,
    setContactEmail,
    contactCompany,
    setContactCompany,
    invoiceRequested,
    setInvoiceRequested,
    invoiceName,
    setInvoiceName,
    invoiceVatNumber,
    setInvoiceVatNumber,
    invoiceEmail,
    setInvoiceEmail,
    errors,
    setErrors,
    runValidateDetails,
    previewPlaybackIds,
    setPreviewPlaybackIds,
    isGeneratingPreview,
    setIsGeneratingPreview,
    previewProgress,
    setPreviewProgress,
    isProcessing,
    setIsProcessing,
    paymentProgress,
    setPaymentProgress,
  };
}
