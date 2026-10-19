import type { ReactNode } from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "react-email";
import { EMAIL_LOGO, styles } from "../theme";
import type { TemplateContext, Translate } from "./types";

interface EmailLayoutProps {
  children: ReactNode;
  context: TemplateContext;
  heading: string;
  preheader: string;
}

/** The header: the logo from the site, or the wordmark without a site URL. */
function Brand({
  siteUrl,
  t,
}: {
  siteUrl?: string | undefined;
  t: Translate;
}): ReactNode {
  if (!siteUrl) {
    return <Text style={styles.brand}>{t("common.appName")}</Text>;
  }
  return (
    <Img
      alt={t("email.common.logoAlt")}
      height={EMAIL_LOGO.height}
      src={new URL(EMAIL_LOGO.path, siteUrl).toString()}
      style={styles.logo}
      width={EMAIL_LOGO.width}
    />
  );
}

/**
 * The shared frame (inventory §4): the green header with the logo, the
 * heading, the body, the signature, and under the card the organisation's
 * footer ("© <year> SMOG & CO vzw · België" and the tagline).
 */
export function EmailLayout({
  children,
  context,
  heading,
  preheader,
}: EmailLayoutProps): ReactNode {
  const { locale, siteUrl, t } = context;
  return (
    <Html dir="ltr" lang={locale}>
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Brand siteUrl={siteUrl} t={t} />
          </Section>
          <Section style={styles.content}>
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            {children}
            <Text style={styles.text}>{t("email.auth.signature")}</Text>
          </Section>
        </Container>
        <Section style={styles.legalSection}>
          <Text style={styles.legal}>
            {t("email.common.copyright", { year: new Date().getUTCFullYear() })}
          </Text>
          <Text style={styles.legal}>{t("email.common.tagline")}</Text>
        </Section>
      </Body>
    </Html>
  );
}

/** "Hello Ada," or "Hello," when there is no name. */
export function Greeting({
  name,
  t,
}: {
  name?: string | null | undefined;
  t: Translate;
}): ReactNode {
  return (
    <Text style={styles.text}>
      {name ? t("email.auth.greetingName", { name }) : t("email.auth.greeting")}
    </Text>
  );
}

/** The call-to-action button plus the copy-paste fallback link. */
export function ActionLink({
  label,
  t,
  url,
}: {
  label: string;
  t: Translate;
  url: string;
}): ReactNode {
  return (
    <>
      <Section style={{ margin: "24px 0", textAlign: "center" }}>
        <Button href={url} style={styles.button}>
          {label}
        </Button>
      </Section>
      <Text style={styles.footer}>{t("email.auth.linkFallback")}</Text>
      <Text style={styles.footer}>
        <Link href={url} style={styles.link}>
          {url}
        </Link>
      </Text>
    </>
  );
}

export function Footer({ children }: { children: string }): ReactNode {
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>{children}</Text>
    </>
  );
}

/** One label / value line of a `DetailsBox`. */
export interface DetailRow {
  label: string;
  value: ReactNode;
}

/**
 * A tinted box of label / value rows (a receipt, the sponsorship details,
 * the invoice request). A table, so every client lines the values up.
 */
export function DetailsBox({
  rows,
  title,
}: {
  rows: DetailRow[];
  title?: string | undefined;
}): ReactNode {
  return (
    <Section style={styles.box}>
      {title ? <Text style={styles.boxTitle}>{title}</Text> : null}
      {rows.map((row) => (
        <Row key={row.label}>
          <Column data-email-label="" style={styles.rowLabel}>
            {row.label}
          </Column>
          <Column style={styles.rowValue}>{row.value}</Column>
        </Row>
      ))}
    </Section>
  );
}

/** A tinted box with a title and numbered steps (or bullet items). */
export function StepsBox({
  numbered = true,
  steps,
  title,
}: {
  numbered?: boolean;
  steps: ReactNode[];
  title?: string | undefined;
}): ReactNode {
  return (
    <Section style={styles.box}>
      {title ? <Text style={styles.boxTitle}>{title}</Text> : null}
      {steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered.
        <Text key={index} style={styles.step}>
          {numbered ? `${index + 1}. ` : "• "}
          {step}
        </Text>
      ))}
    </Section>
  );
}
