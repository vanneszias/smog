import { formatDate, type Locale } from "@smog/i18n";
import {
  LEGAL_CANONICAL_LOCALE,
  type LegalBlock,
  type LegalDocument,
  type LegalKind,
  parseLegalInline,
} from "@smog/i18n/legal/markup";
import { useTranslation } from "@smog/i18n/react";
import { Button, Card, Heading, Text, TextLink } from "@smog/ui-web";
import { Link, type LinkProps } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import type { ReactNode } from "react";
import { AnalyticsSwitch } from "@/components/consent-banner";
import { Page } from "@/components/learning/page";
import type { LegalMetaByLocale, LegalSearch } from "@/components/legal-head";
import { useLocale } from "@/lib/locale";
import type { LegalText, LegalTexts } from "@/server/legal.functions";

const EXTERNAL = /^https:\/\//;

function legalPath(kind: LegalKind): "/privacy" | "/terms" {
  return kind === "privacy" ? "/privacy" : "/terms";
}

function Inline({ text }: { text: string }): ReactNode {
  return parseLegalInline(text).map((part, index) => {
    const key = `${index}-${part.type}`;
    if (part.type === "strong") {
      return (
        <strong className="font-semibold" key={key}>
          {part.text}
        </strong>
      );
    }
    if (part.type === "link" && part.href.startsWith("/")) {
      // A site page: a router link (no full reload). The texts only link
      // to real routes (`/account`, `/privacy`).
      return (
        <TextLink asChild className="underline" key={key}>
          <Link to={part.href as LinkProps["to"]}>{part.text}</Link>
        </TextLink>
      );
    }
    if (part.type === "link") {
      const external = EXTERNAL.test(part.href);
      return (
        <TextLink
          className="underline"
          href={part.href}
          key={key}
          {...(external
            ? { rel: "noopener noreferrer", target: "_blank" }
            : {})}
        >
          {part.text}
        </TextLink>
      );
    }
    return part.text;
  });
}

function Block({
  block,
  preview,
}: {
  block: LegalBlock;
  preview: boolean;
}): ReactNode {
  const { t } = useTranslation();
  if (typeof block === "string") {
    return (
      <Text>
        <Inline text={block} />
      </Text>
    );
  }
  if ("list" in block) {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-6 text-body">
        {block.list.map((item) => (
          <li key={item}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if ("lines" in block) {
    return (
      <address className="flex flex-col text-body not-italic">
        {block.lines.map((line) => (
          <span key={line}>
            <Inline text={line} />
          </span>
        ))}
      </address>
    );
  }
  return (
    <Card aria-label={t("legal.consentControl")} className="p-4" role="group">
      {preview ? (
        // The editor's preview never changes the editor's own consent.
        <Text size="body-sm" tone="muted">
          {t("admin.translation.legal.consentPlaceholder")}
        </Text>
      ) : (
        <AnalyticsSwitch />
      )}
    </Card>
  );
}

/**
 * For en and fr: "This translation is for convenience; the Dutch version
 * prevails", with a link to the Dutch text on the same page
 * (`?lang=nl`), or back to the translation while the Dutch text shows.
 * It only changes the URL: never the site language or the account's
 * (review I2).
 */
function TranslationNotice({
  dutch,
  kind,
  toggle,
}: {
  dutch: boolean;
  kind: LegalKind;
  /** Whether the visitor chose the Dutch text and can go back (not the case when the language has no text of its own). */
  toggle: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const to = legalPath(kind);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border-subtle border-l-4 border-l-primary bg-popover p-4 sm:flex-row sm:items-center"
      role="note"
    >
      <Languages
        aria-hidden="true"
        className="size-5 shrink-0 text-primary-strong"
      />
      <Text className="flex-1" size="body-sm">
        {t(dutch ? "legal.readingDutch" : "legal.translationNotice")}
      </Text>
      {dutch && toggle ? (
        <Button asChild size="md" variant="secondary">
          <Link search={{}} to={to}>
            {t("legal.showTranslation")}
          </Link>
        </Button>
      ) : null}
      {dutch ? null : (
        <Button asChild size="md" variant="secondary">
          {/* The label is Dutch, like the text it opens (review M1). */}
          <Link lang="nl" search={{ lang: "nl" }} to={to}>
            {t("legal.readDutch", { lng: LEGAL_CANONICAL_LOCALE })}
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * The text itself: numbered sections with anchors and a contents list, in
 * kit typography. Shared by the public pages and the translation editor's
 * preview (`preview` swaps the live analytics switch for a placeholder).
 */
export function LegalDocumentView({
  contentsId,
  doc,
  effectiveDate,
  locale,
  preview = false,
}: {
  contentsId: string;
  doc: LegalDocument;
  /** ISO date shown as "last updated". */
  effectiveDate: string;
  /** The language the text is written in. */
  locale: Locale;
  preview?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const updated = formatDate(Date.parse(effectiveDate), locale);
  return (
    <article
      className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-12"
      lang={locale}
    >
      <header className="flex max-w-reading flex-col gap-2 lg:col-start-2">
        <Heading level={1}>{doc.title}</Heading>
        <Text size="body-sm" tone="muted">
          {t("legal.lastUpdated", { date: updated, lng: locale })}
        </Text>
      </header>
      <nav
        aria-labelledby={contentsId}
        className="flex flex-col gap-2 lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        <Heading id={contentsId} level={2} size="title-3">
          {t("legal.contents", { lng: locale })}
        </Heading>
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-body-sm">
          {doc.sections.map((section) => (
            <li key={section.id}>
              <TextLink href={`#${section.id}`}>{section.title}</TextLink>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex max-w-reading flex-col gap-8 lg:col-start-2">
        {doc.sections.map((section, index) => (
          <section
            aria-labelledby={`${section.id}-title`}
            className="flex scroll-mt-20 flex-col gap-3"
            id={section.id}
            key={section.id}
          >
            <Heading id={`${section.id}-title`} level={2} size="title-3">
              {index + 1}. {section.title}
            </Heading>
            {section.blocks.map((block, blockIndex) => (
              // The blocks are static text: their order is their identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <Block block={block} key={blockIndex} preview={preview} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

/**
 * `/privacy` and `/terms` (spec §9, inventory P-07, P-08): the published
 * text of the visitor's language (`texts`, from D1 through
 * `getLegalTexts`, the shipped text when D1 has no usable row). Dutch
 * prevails, so every other language carries a translation notice, and
 * `?lang=nl` shows the Dutch text in place (the article gets `lang="nl"`;
 * the site language stays).
 */
export function LegalPage({
  kind,
  search,
  texts,
}: {
  kind: LegalKind;
  search: LegalSearch;
  texts: LegalTexts;
}): ReactNode {
  const { locale } = useLocale();
  const dutch = search.lang === LEGAL_CANONICAL_LOCALE;
  const asked = dutch ? LEGAL_CANONICAL_LOCALE : locale;
  const text: LegalText | undefined =
    texts[asked] ?? texts[LEGAL_CANONICAL_LOCALE];
  if (!text) {
    throw new Error(`[legal] No ${kind} text loaded for ${asked}`);
  }
  // A language without a text of its own reads the Dutch one.
  const showsDutch = text.locale === LEGAL_CANONICAL_LOCALE;
  return (
    <Page className="gap-8">
      {locale === LEGAL_CANONICAL_LOCALE ? null : (
        <TranslationNotice dutch={showsDutch} kind={kind} toggle={dutch} />
      )}
      <LegalDocumentView
        contentsId={`${kind}-contents`}
        doc={text.document}
        effectiveDate={text.effectiveDate}
        locale={text.locale}
      />
    </Page>
  );
}

/** Title and first paragraph of each loaded text (the route loader). */
export function legalMeta(texts: LegalTexts): LegalMetaByLocale {
  return Object.fromEntries(
    Object.entries(texts).map(([locale, { document: doc }]) => {
      const first = doc.sections[0]?.blocks.find(
        (block): block is string => typeof block === "string"
      );
      const description = first
        ? parseLegalInline(first)
            .map((part) => part.text)
            .join("")
        : doc.title;
      return [locale, { description, title: doc.title }];
    })
  );
}
