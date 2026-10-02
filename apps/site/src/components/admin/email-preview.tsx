import { useEmailPreview, useEmailTemplates } from "@smog/admin/client";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@smog/config/constants";
import { EMAIL_TEMPLATE_IDS, type EmailTemplateId } from "@smog/email/samples";
import type { Translate, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Card,
  cn,
  EmptyState,
  ErrorState,
  Heading,
  SegmentedControl,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@smog/ui-web";
import { Mail, Monitor, Smartphone } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * Each template's name. The key map makes `check-types` fail when a
 * registered template has no label.
 */
const TEMPLATE_LABELS = {
  "auth/magic-link": "admin.emails.template.magicLink",
  "auth/otp": "admin.emails.template.otp",
  "auth/reset-password": "admin.emails.template.resetPassword",
  "auth/verify-email": "admin.emails.template.verifyEmail",
  "transactional/admin-new-sponsorship":
    "admin.emails.template.adminNewSponsorship",
  "transactional/admin-refund-needed":
    "admin.emails.template.adminRefundNeeded",
  "transactional/admin-render-failed":
    "admin.emails.template.adminRenderFailed",
  "transactional/payment-confirmed": "admin.emails.template.paymentConfirmed",
  "transactional/renewal-reminder": "admin.emails.template.renewalReminder",
  "transactional/sponsorship-live": "admin.emails.template.sponsorshipLive",
  "transactional/sponsorship-received":
    "admin.emails.template.sponsorshipReceived",
  "transactional/welcome": "admin.emails.template.welcome",
} as const satisfies Record<EmailTemplateId, TranslationKey>;

const LOCALE_LABELS = {
  en: "language.en",
  fr: "language.fr",
  nl: "language.nl",
} as const satisfies Record<Locale, TranslationKey>;

/** The preview widths (W-07): a desktop client's column and a phone. */
const WIDTHS = { desktop: 780, mobile: 390 } as const;
type PreviewWidth = keyof typeof WIDTHS;

export function emailTemplateLabel(t: Translate, id: EmailTemplateId): string {
  return t(TEMPLATE_LABELS[id]);
}

/**
 * The preview document's own policy: nothing loads and nothing runs, only
 * the template's inline styles and inline images. The walls, in order:
 * - the iframe's empty `sandbox` blocks scripts, forms, popups and top
 *   navigation (the frame could still navigate itself);
 * - `<base target="_blank">` turns every link click into a popup, which
 *   the sandbox blocks, so a sample link never opens;
 * - this policy, and the page's own CSP, which a `srcdoc` document
 *   inherits (its `frame-src` would also stop the frame loading a link).
 */
export const EMAIL_PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

const HEAD = /<head(\s[^>]*)?>/i;

/**
 * The rendered email with `EMAIL_PREVIEW_CSP` and `<base target="_blank">`
 * first in its head.
 */
export function sandboxedEmailDocument(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${EMAIL_PREVIEW_CSP}"><base target="_blank">`;
  return HEAD.test(html)
    ? html.replace(HEAD, (tag) => `${tag}${meta}`)
    : `${meta}${html}`;
}

/** Below Tailwind's `sm`. */
const NARROW = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isNarrow(): boolean {
  return window.matchMedia(NARROW).matches;
}

function notNarrowOnServer(): boolean {
  return false;
}

/** Whether the screen is phone-sized (false while rendering on the server). */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, notNarrowOnServer);
}

export interface EmailPreviewSearch {
  locale?: Locale;
  template?: EmailTemplateId;
  width?: PreviewWidth;
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

/** `/admin/emails`' URL: the template, the locale and the width. */
export function validateEmailPreviewSearch(
  search: Record<string, unknown>
): EmailPreviewSearch {
  return {
    locale: isOneOf(LOCALES, search.locale) ? search.locale : undefined,
    template: isOneOf(EMAIL_TEMPLATE_IDS, search.template)
      ? search.template
      : undefined,
    width: isOneOf(Object.keys(WIDTHS) as PreviewWidth[], search.width)
      ? search.width
      : undefined,
  };
}

interface TemplateButtonProps {
  current: boolean;
  id: EmailTemplateId;
  onSelect: (id: EmailTemplateId) => void;
  subject: string;
}

function TemplateButton({
  current,
  id,
  onSelect,
  subject,
}: TemplateButtonProps): ReactNode {
  const { t } = useTranslation();
  const select = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <button
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex min-h-touch w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left",
        "outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        current &&
          "bg-primary-subtle text-primary-strong hover:bg-primary-subtle"
      )}
      onClick={select}
      type="button"
    >
      <span className="font-medium text-body-sm">
        {emailTemplateLabel(t, id)}
      </span>
      <span
        className={cn(
          "w-full truncate text-caption",
          current ? "text-primary-strong" : "text-foreground-muted"
        )}
      >
        {subject}
      </span>
    </button>
  );
}

interface TemplateListProps {
  locale: Locale;
  onSelect: (id: EmailTemplateId) => void;
  selected: EmailTemplateId;
  templates: readonly { id: string; subject: Record<Locale, string> }[];
}

function TemplateList({
  locale,
  onSelect,
  selected,
  templates,
}: TemplateListProps): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {templates.map(({ id, subject }) => {
        if (!isOneOf(EMAIL_TEMPLATE_IDS, id)) {
          return null;
        }
        return (
          <li key={id}>
            <TemplateButton
              current={id === selected}
              id={id}
              onSelect={onSelect}
              subject={subject[locale]}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface PreviewPaneProps {
  locale: Locale;
  template: EmailTemplateId;
  width: PreviewWidth;
}

function PreviewPane({ locale, template, width }: PreviewPaneProps): ReactNode {
  const { t } = useTranslation();
  const preview = useEmailPreview(template, locale);
  const document = useMemo(
    () => (preview.data ? sandboxedEmailDocument(preview.data.html) : ""),
    [preview.data]
  );
  const retry = useCallback(() => {
    preview.refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the email preview:", error);
    });
  }, [preview]);

  if (preview.isError) {
    return (
      <ErrorState
        description={t("admin.emails.previewError")}
        level={2}
        onRetry={retry}
      />
    );
  }
  if (!preview.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const name = emailTemplateLabel(t, template);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <dl className="flex flex-col gap-1">
        <dt>
          <Text as="span" size="caption" tone="muted" weight="semibold">
            {t("admin.emails.subject")}
          </Text>
        </dt>
        <dd className="break-words font-semibold text-body">
          {preview.data.subject}
        </dd>
      </dl>
      <Tabs defaultValue="html">
        <TabsList aria-label={t("admin.emails.view")}>
          <TabsTrigger value="html">{t("admin.emails.html")}</TabsTrigger>
          <TabsTrigger value="text">{t("admin.emails.text")}</TabsTrigger>
        </TabsList>
        <TabsContent value="html">
          <div className="flex flex-col gap-2">
            {/* Wider than a phone: scrollable, so it takes focus (keyboard
                scrolling, axe scrollable-region-focusable). */}
            <section
              aria-label={t("admin.emails.frameTitle", { name })}
              className="overflow-x-auto rounded-md border border-border-subtle bg-surface-sunken p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
              tabIndex={0}
            >
              <iframe
                className="mx-auto block h-[40rem] max-w-none rounded-sm bg-surface"
                sandbox=""
                srcDoc={document}
                style={{ width: `${WIDTHS[width]}px` }}
                title={t("admin.emails.frameTitle", { name })}
              />
            </section>
            <Text size="caption" tone="muted">
              {t("admin.emails.sandboxed")}
            </Text>
          </div>
        </TabsContent>
        <TabsContent value="text">
          <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-surface-sunken p-4 font-mono text-body-sm">
            {preview.data.text}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export interface EmailPreviewProps {
  onSearchChange: (next: EmailPreviewSearch) => void;
  search: EmailPreviewSearch;
}

/**
 * The email previews (A-25, W-07): the template list, the locale and the
 * width, the subject, and the template in an `<iframe sandbox="">` (no
 * scripts, its own CSP) or as plain text. Rendered on the server from
 * `EMAIL_SAMPLES`; nothing is sent.
 */
export function EmailPreview({
  onSearchChange,
  search,
}: EmailPreviewProps): ReactNode {
  const { t } = useTranslation();
  const templates = useEmailTemplates();
  const locale = search.locale ?? DEFAULT_LOCALE;
  // Without a choice in the URL: the phone width on a phone.
  const narrow = useNarrowScreen();
  const width = search.width ?? (narrow ? "mobile" : "desktop");
  const localeOptions = useMemo(
    () => LOCALES.map((value) => ({ label: t(LOCALE_LABELS[value]), value })),
    [t]
  );
  const widthOptions = useMemo(
    () => [
      { icon: <Monitor />, label: t("admin.emails.desktop"), value: "desktop" },
      {
        icon: <Smartphone />,
        label: t("admin.emails.mobile"),
        value: "mobile",
      },
    ],
    [t]
  );
  const onLocale = useCallback(
    (value: string) => {
      if (isOneOf(LOCALES, value)) {
        onSearchChange({ ...search, locale: value });
      }
    },
    [onSearchChange, search]
  );
  const onWidth = useCallback(
    (value: string) => {
      if (value === "desktop" || value === "mobile") {
        onSearchChange({ ...search, width: value });
      }
    },
    [onSearchChange, search]
  );
  const onTemplate = useCallback(
    (template: EmailTemplateId) => onSearchChange({ ...search, template }),
    [onSearchChange, search]
  );
  const retry = useCallback(() => {
    templates.refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the email templates:", error);
    });
  }, [templates]);

  if (templates.isError) {
    return (
      <ErrorState
        description={t("admin.emails.loadError")}
        level={2}
        onRetry={retry}
      />
    );
  }
  if (templates.isPending) {
    return (
      <div aria-busy="true" className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const first = templates.data.find((item) =>
    isOneOf(EMAIL_TEMPLATE_IDS, item.id)
  )?.id;
  const selected =
    search.template ?? (first as EmailTemplateId | undefined) ?? null;
  if (!selected) {
    return (
      <EmptyState icon={<Mail />} level={2} title={t("admin.emails.empty")} />
    );
  }
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <Card className="gap-2 p-2 sm:p-2 lg:self-start" variant="default">
        <Heading className="px-3 pt-2" level={2} size="title-3">
          {t("admin.emails.templates")}
        </Heading>
        <TemplateList
          locale={locale}
          onSelect={onTemplate}
          selected={selected}
          templates={templates.data}
        />
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label={t("admin.emails.locale")}
            onValueChange={onLocale}
            options={localeOptions}
            size="sm"
            value={locale}
          />
          <SegmentedControl
            aria-label={t("admin.emails.width")}
            onValueChange={onWidth}
            options={widthOptions}
            size="sm"
            value={width}
          />
        </div>
        <PreviewPane locale={locale} template={selected} width={width} />
      </div>
    </div>
  );
}
