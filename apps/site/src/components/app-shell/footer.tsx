import { CONTACT_EMAIL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import { Logo, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";

const AUTHOR_URL = "https://zias.be";
// Keep the phrase and its word order in the existing plain-text catalogue.
const CREDIT_TOKENS = /(♡|zias\.be)/u;

/** A footer link: a text link with a 44 px target (spec §16). */
function FooterLink({
  children,
  to,
}: {
  children: ReactNode;
  to: string;
}): ReactNode {
  return (
    <TextLink asChild className="inline-flex min-h-touch items-center">
      <Link to={to}>{children}</Link>
    </TextLink>
  );
}

/**
 * The footer (phase 10a): the logo, the sections, Sponsor (which left the
 * header), the legal links, the contact address and the credit line. The
 * legal links are plain anchors: those pages are served as documents.
 */
export function Footer(): ReactNode {
  const { t } = useTranslation();
  return (
    <footer className="border-border-subtle border-t bg-card">
      <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 py-10 md:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-3">
            <Logo decorative size="md" tone="primary" />
            <Text className="max-w-xs" size="body-sm" tone="muted">
              {t("home.tagline")}
            </Text>
          </div>
          <nav aria-label={t("shell.explore")} className="flex flex-col">
            <Text as="span" weight="semibold">
              {t("shell.explore")}
            </Text>
            <ul className="flex flex-col">
              <li>
                <FooterLink to="/gestures">{t("nav.gestures")}</FooterLink>
              </li>
              <li>
                <FooterLink to="/my">{t("mySpace.title")}</FooterLink>
              </li>
            </ul>
          </nav>
          <nav aria-label={t("shell.supportTitle")} className="flex flex-col">
            <Text as="span" weight="semibold">
              {t("shell.supportTitle")}
            </Text>
            <ul className="flex flex-col">
              <li>
                <FooterLink to="/sponsor">{t("nav.sponsor")}</FooterLink>
              </li>
            </ul>
            <Text className="max-w-xs" size="body-sm" tone="muted">
              {t("shell.supportText")}
            </Text>
          </nav>
          <nav aria-label={t("nav.legal")} className="flex flex-col">
            <Text as="span" weight="semibold">
              {t("nav.legal")}
            </Text>
            <ul className="flex flex-col">
              <li>
                <TextLink
                  className="inline-flex min-h-touch items-center"
                  href="/privacy"
                >
                  {t("nav.privacy")}
                </TextLink>
              </li>
              <li>
                <TextLink
                  className="inline-flex min-h-touch items-center"
                  href="/terms"
                >
                  {t("nav.terms")}
                </TextLink>
              </li>
              <li>
                <TextLink
                  className="inline-flex min-h-touch items-center"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {t("nav.contact")}
                </TextLink>
              </li>
            </ul>
          </nav>
        </div>
        <Text size="body-sm" tone="muted">
          <TextLink
            className="group inline-flex min-h-touch items-center rounded-full border border-border-subtle bg-background px-3.5 font-regular hover:border-border hover:no-underline"
            href={AUTHOR_URL}
            rel="noopener noreferrer"
            target="_blank"
            tone="muted"
          >
            <span>
              {t("footer.madeBy")
                .split(CREDIT_TOKENS)
                .map((part) => {
                  if (part === "♡") {
                    return (
                      <span key={part}>
                        <Heart
                          aria-hidden="true"
                          className="mx-1 inline-block size-4 fill-current align-text-bottom text-highlight"
                        />
                        <span className="sr-only">{t("footer.love")}</span>
                      </span>
                    );
                  }
                  if (part === "zias.be") {
                    return (
                      <span
                        className="font-semibold text-foreground group-hover:underline group-focus-visible:underline"
                        key={part}
                      >
                        {part}
                      </span>
                    );
                  }
                  return part;
                })}
            </span>
          </TextLink>
        </Text>
      </div>
    </footer>
  );
}
