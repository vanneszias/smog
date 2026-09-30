import { formatDate } from "@smog/i18n";
import {
  LEGAL_CANONICAL_LOCALE,
  LEGAL_UPDATED,
  type LegalBlock,
  type LegalKind,
  legalDocument,
  parseLegalInline,
} from "@smog/i18n/legal";
import { useTranslation } from "@smog/i18n/react";
import { Button, Card, Heading, Text, TextLink } from "@smog/ui-web";
import { Languages } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AnalyticsSwitch } from "@/components/consent-banner";
import { Page } from "@/components/learning/page";
import { seoHead, shellHead } from "@/lib/head";
import { useLocale } from "@/lib/locale";

const EXTERNAL = /^https:\/\//;

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

/** "This translation is for convenience; the Dutch version prevails." */
function TranslationNotice(): ReactNode {
  const { t } = useTranslation();
  const { setLocale } = useLocale();
  const readDutch = useCallback(
    () => setLocale(LEGAL_CANONICAL_LOCALE),
    [setLocale]
  );
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
        {t("legal.translationNotice")}
      </Text>
      <Button lang="nl" onClick={readDutch} size="md" variant="secondary">
        {t("legal.readDutch")}
      </Button>
    </div>
  );
}

/**
 * `/privacy` and `/terms` (spec §9, inventory P-07, P-08): one source per
 * language (`@smog/i18n/legal`), kit typography, numbered sections with
 * anchors and a contents list. Dutch prevails, so en and fr carry a
 * translation notice.
 */
export function LegalPage({ kind }: { kind: LegalKind }): ReactNode {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const doc = legalDocument(locale, kind);
  const updated = formatDate(Date.parse(LEGAL_UPDATED[kind]), locale);
  const contentsId = `${kind}-contents`;
  return (
    <Page className="max-w-reading gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={1}>{doc.title}</Heading>
        <Text size="body-sm" tone="muted">
          {t("legal.lastUpdated", { date: updated })}
        </Text>
      </header>
      {locale === LEGAL_CANONICAL_LOCALE ? null : <TranslationNotice />}
      <nav aria-labelledby={contentsId} className="flex flex-col gap-2">
        <Heading id={contentsId} level={2} size="title-3">
          {t("legal.contents")}
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
