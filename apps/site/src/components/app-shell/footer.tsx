import { CONTACT_EMAIL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import { Logo, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const AUTHOR_URL = "https://zias.be";

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
 * Its bottom padding grows to the height of a fixed bar (the consent
 * banner, `--overlay-bottom` from `useReservedSpace`), so that bar floats
 * over the footer and every footer link can still scroll clear of it.
 */
export function Footer(): ReactNode {
  const { t } = useTranslation();
  return (
    <footer className="border-border-subtle border-t bg-card">
      <div className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 pt-10 pb-[max(--spacing(10),var(--overlay-bottom,0px))] md:px-6 lg:px-8">
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
          <TextLink href={AUTHOR_URL} tone="muted">
            {t("footer.madeBy")}
          </TextLink>
        </Text>
      </div>
    </footer>
  );
}
