import { formatDate, type Locale } from "@smog/i18n";
import {
  LEGAL_CANONICAL_LOCALE,
  LEGAL_EFFECTIVE_DATE,
  type LegalBlock,
  type LegalKind,
  legalDocument,
  parseLegalInline,
} from "@smog/i18n/legal";
import { useTranslation } from "@smog/i18n/react";
import { Button, Card, Heading, Text, TextLink } from "@smog/ui-web";
import { Link, type LinkProps } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import type { ReactNode } from "react";
import { AnalyticsSwitch } from "@/components/consent-banner";
import { Page } from "@/components/learning/page";
import { seoHead, shellHead } from "@/lib/head";
import { useLocale } from "@/lib/locale";

const EXTERNAL = /^https:\/\//;

/** `/privacy?lang=nl`: the Dutch text in place, whatever the site language. */
export interface LegalSearch {
  lang?: "nl";
}

/** Keeps only `lang=nl` (review I2: reading Dutch changes no setting). */
export function validateLegalSearch(
  search: Record<string, unknown>
): LegalSearch {
  return search.lang === LEGAL_CANONICAL_LOCALE ? { lang: "nl" } : {};
}

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

function Block({ block }: { block: LegalBlock }): ReactNode {
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
      <AnalyticsSwitch />
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
}: {
  dutch: boolean;
  kind: LegalKind;
}): ReactNode {
  const { t } = useTranslation();
  const to = legalPath(kind);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border-subtle border-l-4 border-l-primary bg-surface-raised p-4 sm:flex-row sm:items-center"
      role="note"
    >
      <Languages
        aria-hidden="true"
        className="size-5 shrink-0 text-primary-strong"
      />
      <Text className="flex-1" size="body-sm">
        {t(dutch ? "legal.readingDutch" : "legal.translationNotice")}
      </Text>
      {dutch ? (
        <Button asChild size="md" variant="secondary">
          <Link search={{}} to={to}>
            {t("legal.showTranslation")}
          </Link>
        </Button>
      ) : (
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
 * `/privacy` and `/terms` (spec §9, inventory P-07, P-08): one source per
 * language (`@smog/i18n/legal`), kit typography, numbered sections with
 * anchors and a contents list. Dutch prevails, so en and fr carry a
 * translation notice, and `?lang=nl` shows the Dutch text in place (the
 * article gets `lang="nl"`; the site language stays).
 */
export function LegalPage({
  kind,
  search,
}: {
  kind: LegalKind;
  search: LegalSearch;
}): ReactNode {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dutch = search.lang === LEGAL_CANONICAL_LOCALE;
  const textLocale: Locale = dutch ? LEGAL_CANONICAL_LOCALE : locale;
  const doc = legalDocument(textLocale, kind);
  const updated = formatDate(Date.parse(LEGAL_EFFECTIVE_DATE), textLocale);
  const contentsId = `${kind}-contents`;
  return (
    <Page className="max-w-reading gap-8">
      {locale === LEGAL_CANONICAL_LOCALE ? null : (
        <TranslationNotice dutch={dutch} kind={kind} />
      )}
      <article className="flex flex-col gap-8" lang={textLocale}>
        <header className="flex flex-col gap-2">
          <Heading level={1}>{doc.title}</Heading>
          <Text size="body-sm" tone="muted">
            {t("legal.lastUpdated", { date: updated, lng: textLocale })}
          </Text>
        </header>
        <nav aria-labelledby={contentsId} className="flex flex-col gap-2">
          <Heading id={contentsId} level={2} size="title-3">
            {t("legal.contents", { lng: textLocale })}
          </Heading>
          <ol className="flex list-decimal flex-col gap-1 pl-6 text-body-sm">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <TextLink href={`#${section.id}`}>{section.title}</TextLink>
              </li>
            ))}
          </ol>
        </nav>
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
              <Block block={block} key={blockIndex} />
            ))}
          </section>
        ))}
      </article>
    </Page>
  );
}

/** The page head: title, the first paragraph as description, canonical. */
export function legalHead(
  matches: Parameters<typeof shellHead>[0],
  kind: LegalKind
) {
  const { locale } = shellHead(matches);
  const doc = legalDocument(locale, kind);
  const first = doc.sections[0]?.blocks.find(
    (block): block is string => typeof block === "string"
  );
  const description = first
    ? parseLegalInline(first)
        .map((part) => part.text)
        .join("")
    : doc.title;
  return seoHead(matches, { description, path: `/${kind}`, title: doc.title });
}
