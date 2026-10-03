import {
  DISPLAY_NAME_MAX,
  LOGO_ADDON_PER_GESTURE_CENTS,
} from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import { RENDER_OVERLAY_LAYOUT } from "@smog/render/contract";
import {
  type DetailsErrors,
  type DetailsField,
  validateDetails,
  type WizardDetails,
  type WizardState,
} from "@smog/sponsorships/client";
import { Button, Checkbox, Field, Heading, Input, Text } from "@smog/ui-web";
import { formatMoney } from "@smog/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { detailsErrorMessage } from "./errors";
import { LogoDropzone, LogoGuidelines } from "./logo-dropzone";
import { usePageLocale } from "./page-locale";
import { PriceSummary } from "./price-summary";

export interface StepDetailsProps {
  onBack: () => void;
  onContinue: () => void;
  onDetails: (patch: Partial<WizardDetails>) => void;
  onLogo: (logo: Blob | null) => void;
  state: WizardState;
  titleRef: (node: HTMLHeadingElement | null) => void;
}

type TextField = Exclude<keyof WizardDetails, "includeLogo" | "wantsInvoice">;

/**
 * Step 2, "Your details" (S-05–S-08): the name in the video with a live
 * counter (/35), the logo add-on with its dropzone, the contact and the
 * optional invoice request (the BE number checked with the shared mod-97
 * check). Errors sit on their fields once Continue was pressed, and the
 * logo's type and size are flagged as soon as a file is chosen.
 */
export function StepDetails({
  onBack,
  onContinue,
  onDetails,
  onLogo,
  state,
  titleRef,
}: StepDetailsProps): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const { details, logo } = state;
  const [submitted, setSubmitted] = useState(false);
  const errors: DetailsErrors = useMemo(
    () => validateDetails(details, logo),
    [details, logo]
  );

  const errorFor = (field: DetailsField): string | undefined => {
    const error = errors[field];
    const early =
      field === "logo" && (error === "logoType" || error === "logoTooLarge");
    if (!(error && (submitted || early))) {
      return;
    }
    return detailsErrorMessage(field, error, t, DISPLAY_NAME_MAX);
  };

  const text = useCallback(
    (field: TextField) => (event: ChangeEvent<HTMLInputElement>) =>
      onDetails({ [field]: event.target.value }),
    [onDetails]
  );
  const toggleLogo = useCallback(
    (checked: boolean | "indeterminate") =>
      onDetails({ includeLogo: checked === true }),
    [onDetails]
  );
  const toggleInvoice = useCallback(
    (checked: boolean | "indeterminate") => {
      const on = checked === true;
      // S-08: the invoice email starts as the contact email.
      onDetails(
        on && details.invoiceEmail.trim() === ""
          ? { invoiceEmail: details.contactEmail, wantsInvoice: true }
          : { wantsInvoice: on }
      );
    },
    [details.contactEmail, details.invoiceEmail, onDetails]
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitted(true);
      if (Object.keys(errors).length === 0) {
        onContinue();
        return;
      }
      // Focus the first field with an error.
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      });
    },
    [errors, onContinue]
  );

  // The example line of S-05, with the name as typed so far.
  const name = details.displayName.trim() || "…";
  return (
    <form className="flex flex-col gap-8" noValidate onSubmit={submit}>
      <Heading level={1} ref={titleRef} size="title-1" tabIndex={-1}>
        {t("sponsor.details.title")}
      </Heading>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-4">
            <Heading level={2} size="title-3">
              {t("sponsor.details.videoSection")}
            </Heading>
            <Field
              counter={{
                count: details.displayName.trim().length,
                max: DISPLAY_NAME_MAX,
              }}
              error={errorFor("displayName")}
              hint={t("sponsor.details.displayNameHint", {
                intro: RENDER_OVERLAY_LAYOUT.text.intro,
                name,
              })}
              label={t("sponsor.details.displayName")}
              required
            >
              <Input
                // Not the company: browsers would fill it in (review Minor 3).
                autoComplete="off"
                maxLength={DISPLAY_NAME_MAX}
                onChange={text("displayName")}
                placeholder={t("sponsor.details.displayNamePlaceholder")}
                value={details.displayName}
              />
            </Field>
            <Checkbox
              checked={details.includeLogo}
              label={t("sponsor.details.logo.include", {
                price: formatMoney(LOGO_ADDON_PER_GESTURE_CENTS, locale),
              })}
              onCheckedChange={toggleLogo}
            />
            {details.includeLogo ? (
              <Field
                error={errorFor("logo")}
                id="logo-upload"
                label={t("sponsor.details.logo.label")}
                required
              >
                <LogoDropzone file={logo} onChange={onLogo} />
              </Field>
            ) : null}
            {details.includeLogo ? <LogoGuidelines /> : null}
          </section>
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Heading level={2} size="title-3">
                {t("sponsor.details.contact.title")}
              </Heading>
              <Text size="body-sm" tone="muted">
                {t("sponsor.details.contact.description")}
              </Text>
            </div>
            <Field
              error={errorFor("contactName")}
              label={t("sponsor.details.contact.name")}
              required
            >
              <Input
                autoComplete="name"
                onChange={text("contactName")}
                value={details.contactName}
              />
            </Field>
            <Field
              error={errorFor("contactEmail")}
              label={t("sponsor.details.contact.email")}
              required
            >
              <Input
                autoComplete="email"
                inputMode="email"
                onChange={text("contactEmail")}
                type="email"
                value={details.contactEmail}
              />
            </Field>
            <Field
              error={errorFor("company")}
              label={t("sponsor.details.contact.company")}
              optional
            >
              <Input
                autoComplete="organization"
                onChange={text("company")}
                value={details.company}
              />
            </Field>
            <Checkbox
              checked={details.wantsInvoice}
              label={t("sponsor.details.invoice.checkbox")}
              onCheckedChange={toggleInvoice}
            />
            {details.wantsInvoice ? (
              <div className="flex flex-col gap-4 border-border-subtle border-l-2 pl-4">
                <Field
                  error={errorFor("invoiceName")}
                  label={t("sponsor.details.invoice.name")}
                  required
                >
                  <Input
                    onChange={text("invoiceName")}
                    placeholder={t("sponsor.details.invoice.namePlaceholder")}
                    value={details.invoiceName}
                  />
                </Field>
                <Field
                  error={errorFor("vatNumber")}
                  hint={t("sponsor.details.invoice.vatHint")}
                  label={t("sponsor.details.invoice.vat")}
                  required
                >
                  <Input
                    inputMode="text"
                    onChange={text("vatNumber")}
                    value={details.vatNumber}
                  />
                </Field>
                <Field
                  error={errorFor("invoiceEmail")}
                  label={t("sponsor.details.invoice.email")}
                  required
                >
                  <Input
                    autoComplete="email"
                    inputMode="email"
                    onChange={text("invoiceEmail")}
                    type="email"
                    value={details.invoiceEmail}
                  />
                </Field>
              </div>
            ) : null}
          </section>
        </div>
        <PriceSummary
          className="self-start lg:sticky lg:top-4"
          count={state.selected.length}
          logo={details.includeLogo}
        />
      </div>
      {submitted && Object.keys(errors).length > 0 ? (
        <Text role="alert" size="body-sm" tone="danger">
          {t("sponsor.details.errors.summary")}
        </Text>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button icon={<ArrowLeft />} onClick={onBack} variant="secondary">
          {t("sponsor.details.back")}
        </Button>
        <Button icon={<ArrowRight />} type="submit">
          {t("sponsor.details.continue")}
        </Button>
      </div>
    </form>
  );
}
