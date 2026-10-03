import { DISPLAY_NAME_MAX } from "@smog/config/constants";
import { useGesture } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  displayNameError,
  logoFileError,
  useReedit,
  useReeditSubmit,
} from "@smog/sponsorships/client";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Heading,
  Input,
  Text,
} from "@smog/ui-web";
import { DAY_MS } from "@smog/utils";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Turnstile } from "@/components/auth/turnstile";
import { detailsErrorMessage, mutationErrorMessage } from "./errors";
import { LinkState } from "./link-state";
import { LogoDropzone, LogoGuidelines } from "./logo-dropzone";
import { SponsorOverlayPreview } from "./overlay-preview";

export interface ReeditViewProps {
  token: string | null;
  turnstileSiteKey: string | null;
}

interface EditableLink {
  displayName: string;
  expiresAt: number;
  gesture: { name: string; slug: string };
  hasLogo: boolean;
}

/**
 * "Sent!": the form is gone, so its h1 takes the focus and is read out
 * (review I-4).
 */
function Submitted(): ReactNode {
  const { t } = useTranslation();
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = wrapper.current?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, []);
  return (
    <div ref={wrapper}>
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link to="/">{t("sponsor.link.back")}</Link>
          </Button>
        }
        description={t("sponsor.edit.submitted.description")}
        illustration={1}
        level={1}
        title={t("sponsor.edit.submitted.title")}
      />
    </div>
  );
}

/** The form once the link checks out. */
function ReeditForm({
  link,
  token,
  turnstileSiteKey,
}: {
  link: EditableLink;
  token: string;
  turnstileSiteKey: string | null;
}): ReactNode {
  const { t } = useTranslation();
  const gesture = useGesture(link.gesture.slug);
  const submit = useReeditSubmit();
  const [displayName, setDisplayName] = useState(link.displayName);
  const [logo, setLogo] = useState<Blob | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // The name is checked as the wizard checks it; the logo only when chosen.
  const nameError = displayNameError(displayName);
  const logoError = logo ? logoFileError(logo) : null;
  const days = Math.max(1, Math.ceil((link.expiresAt - Date.now()) / DAY_MS));
  const verified = turnstileSiteKey === null || captcha !== null;

  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setDisplayName(event.target.value),
    []
  );
  const send = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitted(true);
      if (nameError || logoError) {
        return;
      }
      submit.mutate(
        { displayName, logo, token, turnstileToken: captcha },
        {
          onError: () => {
            setCaptcha(null);
            setCaptchaKey((key) => key + 1);
          },
        }
      );
    },
    [captcha, displayName, logo, logoError, nameError, submit, token]
  );

  if (submit.isSuccess) {
    return <Submitted />;
  }
  return (
    <form className="flex flex-col gap-8" noValidate onSubmit={send}>
      <div className="flex flex-col gap-2">
        <Text className="font-semibold text-primary-strong" size="body-sm">
          {t("sponsor.edit.eyebrow")}
        </Text>
        <Heading level={1}>{t("sponsor.edit.title")}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          <Text tone="muted">
            {t("sponsor.edit.gesture", { name: link.gesture.name })}
          </Text>
          <Badge variant="warning">
            {t("sponsor.edit.expires", { count: days })}
          </Badge>
        </div>
      </div>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {gesture.data ? (
          <SponsorOverlayPreview
            className="max-w-[20rem]"
            displayName={displayName.trim()}
            logo={logoError ? null : logo}
            name={link.gesture.name}
            playbackId={gesture.data.playbackId}
          />
        ) : (
          <div />
        )}
        <div className="flex min-w-0 flex-col gap-6">
          <Field
            counter={{
              count: displayName.trim().length,
              max: DISPLAY_NAME_MAX,
            }}
            error={
              submitted && nameError
                ? detailsErrorMessage(
                    "displayName",
                    nameError,
                    t,
                    DISPLAY_NAME_MAX
                  )
                : undefined
            }
            label={t("sponsor.details.displayName")}
            required
          >
            <Input
              maxLength={DISPLAY_NAME_MAX}
              onChange={onName}
              value={displayName}
            />
          </Field>
          {link.hasLogo ? (
            <Field
              error={
                logoError
                  ? detailsErrorMessage("logo", logoError, t, DISPLAY_NAME_MAX)
                  : undefined
              }
              hint={t("sponsor.edit.logoHint")}
              id="logo-upload"
              label={t("sponsor.details.logo.label")}
              optional
            >
              <LogoDropzone file={logo} onChange={setLogo} />
            </Field>
          ) : null}
          {link.hasLogo ? <LogoGuidelines /> : null}
          <Text size="body-sm" tone="muted">
            {t("sponsor.edit.noPayment")}
          </Text>
          {turnstileSiteKey ? (
            <Turnstile
              onToken={setCaptcha}
              resetKey={captchaKey}
              siteKey={turnstileSiteKey}
            />
          ) : null}
          {submit.isError ? (
            <Text role="alert" size="body-sm" tone="danger">
              {mutationErrorMessage(submit.error, t, "sponsor.edit.failed")}
            </Text>
          ) : null}
          <Button
            className="self-start"
            disabled={!verified}
            icon={<Send />}
            loading={submit.isPending}
            type="submit"
          >
            {t("sponsor.edit.submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * `/sponsor/edit?token=` (S-19): the link's guards, then the name in the
 * video and (only when the sponsorship has one) a new logo, the preview,
 * Turnstile and "Send for review". Nothing is paid again.
 */
export function ReeditView({
  token,
  turnstileSiteKey,
}: ReeditViewProps): ReactNode {
  const link = useReedit(token);
  const retry = useCallback(() => {
    link.refetch().catch(() => undefined);
  }, [link]);
  if (token === null || !link.data) {
    return (
      <LinkState
        error={link.error}
        isFetching={link.isFetching}
        pending={link.isPending}
        retry={retry}
        token={token}
      />
    );
  }
  return (
    <ReeditForm
      link={link.data}
      token={token}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}
