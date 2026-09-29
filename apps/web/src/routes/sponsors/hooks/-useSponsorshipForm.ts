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
  contactCompany: string;
  contactEmail: string;

  // Contact info
  contactFullName: string;
  // Wizard navigation
  currentStep: WizardStep;

  // Validation
  errors: SponsorDetailsErrors;
  handleToggleSelection: (gestureId: string) => void;
  includeLogo: boolean;
  invoiceEmail: string;
  invoiceName: string;

  // Invoice
  invoiceRequested: boolean;
  invoiceVatNumber: string;
  isGeneratingPreview: boolean;

  // Payment state
  isProcessing: boolean;
  logoFile: File | null;
  logoPreview: string | null;
  paymentProgress: number;

  // Preview state
  previewPlaybackIds: string[];
  previewProgress: number;
  /**
   * Run validation against the current form state.
   * @param t - i18n translate function.
   * @returns `true` if the form is valid.
   */
  runValidateDetails: (t: (key: string) => string) => boolean;

  // Gesture selection
  selectedGestureIds: string[];
  setContactCompany: (v: string) => void;
  setContactEmail: (v: string) => void;
  setContactFullName: (v: string) => void;
  setCurrentStep: (step: WizardStep) => void;
  setErrors: React.Dispatch<React.SetStateAction<SponsorDetailsErrors>>;
  setIncludeLogo: (v: boolean) => void;
  setInvoiceEmail: (v: string) => void;
  setInvoiceName: (v: string) => void;
  setInvoiceRequested: (v: boolean) => void;
  setInvoiceVatNumber: (v: string) => void;
  setIsGeneratingPreview: (v: boolean) => void;
  setIsProcessing: (v: boolean) => void;
  setLogoFile: (v: File | null) => void;
  setLogoPreview: (v: string | null) => void;
  setPaymentProgress: React.Dispatch<React.SetStateAction<number>>;
  setPreviewPlaybackIds: (ids: string[]) => void;
  setPreviewProgress: (v: number) => void;
  setSelectedGestureIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSponsorName: (v: string) => void;

  // Sponsor info
  sponsorName: string;
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
          contactEmail,
          contactFullName,
          includeLogo,
          invoiceEmail,
          invoiceName,
          invoiceRequested,
          invoiceVatNumber,
          logoFile,
          sponsorName,
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
    contactCompany,
    contactEmail,
    contactFullName,
    currentStep,
    errors,
    handleToggleSelection,
    includeLogo,
    invoiceEmail,
    invoiceName,
    invoiceRequested,
    invoiceVatNumber,
    isGeneratingPreview,
    isProcessing,
    logoFile,
    logoPreview,
    paymentProgress,
    previewPlaybackIds,
    previewProgress,
    runValidateDetails,
    selectedGestureIds,
    setContactCompany,
    setContactEmail,
    setContactFullName,
    setCurrentStep,
    setErrors,
    setIncludeLogo,
    setInvoiceEmail,
    setInvoiceName,
    setInvoiceRequested,
    setInvoiceVatNumber,
    setIsGeneratingPreview,
    setIsProcessing,
    setLogoFile,
    setLogoPreview,
    setPaymentProgress,
    setPreviewPlaybackIds,
    setPreviewProgress,
    setSelectedGestureIds,
    setSponsorName,
    sponsorName,
  };
}
