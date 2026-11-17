import { CONTACT_EMAIL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import { Logo, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const AUTHOR_URL = "https://zias.be";

const LINK = "inline-flex min-h-touch items-center";

/** A footer link inside the app: a text link with a 44 px target (spec §16). */
function FooterLink({
  children,
  to,
}: {
  children: ReactNode;
  to: string;
}): ReactNode {
  return (
    <TextLink asChild className={LINK}>
      <Link to={to}>{children}</Link>
    </TextLink>
  );
}

/**
 * The footer: the logo with what SMOG stands for, one row of links (the
 * sections, Sponsor, the legal pages and contact) and a plain credit line.
 * The legal links are plain anchors: those pages are served as documents.
 * Its bottom padding grows to the height of a fixed bar (the consent
 * banner, `--overlay-bottom` from `useReservedSpace`), so that bar floats
 * over the footer and every footer link can still scroll clear of it.
 */
export function Footer(): ReactNode {
  const { t } = useTranslation();
  return (
    <footer className="border-border-subtle border-t bg-card">
      <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-10 pb-[max(--spacing(10),var(--overlay-bottom,0px))] md:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <Logo decorative size="md" tone="primary" />
          <Text className="max-w-reading" tone="muted">
            {t("footer.about")}
          </Text>
        </div>
        <nav aria-label={t("footer.nav")}>
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <FooterLink to="/gestures">{t("nav.gestures")}</FooterLink>
            </li>
            <li>
              <FooterLink to="/my">{t("mySpace.title")}</FooterLink>
            </li>
            <li>
              <FooterLink to="/sponsor">{t("nav.sponsor")}</FooterLink>
            </li>
            <li>
              <TextLink className={LINK} href="/privacy">
                {t("nav.privacy")}
              </TextLink>
            </li>
            <li>
              <TextLink className={LINK} href="/terms">
                {t("nav.terms")}
              </TextLink>
            </li>
            <li>
              <TextLink className={LINK} href={`mailto:${CONTACT_EMAIL}`}>
                {t("nav.contact")}
              </TextLink>
            </li>
          </ul>
        </nav>
        <Text size="body-sm" tone="muted">
          <TextLink
            className={LINK}
            href={AUTHOR_URL}
            rel="noopener noreferrer"
            target="_blank"
            tone="muted"
          >
            {t("footer.credit")}
          </TextLink>
        </Text>
      </div>
    </footer>
  );
}
