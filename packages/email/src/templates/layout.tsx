import type { Locale } from "@smog/i18n";
import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import { styles } from "../theme";
import type { Translate } from "./types";

interface EmailLayoutProps {
  children: ReactNode;
  heading: string;
  locale: Locale;
  preheader: string;
  t: Translate;
}

/** The shared frame: brand bar, heading, body, signature. */
export function EmailLayout({
  children,
  heading,
  locale,
  preheader,
  t,
}: EmailLayoutProps): ReactNode {
  return (
    <Html dir="ltr" lang={locale}>
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{t("common.appName")}</Text>
          </Section>
          <Section style={styles.content}>
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            {children}
            <Text style={styles.text}>{t("email.auth.signature")}</Text>
          </Section>
        </Container>
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
