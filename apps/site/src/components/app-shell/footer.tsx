import { CONTACT_EMAIL } from "@smog/config/constants";
import { useTranslation } from "@smog/i18n/react";
import { Button, Logo, Text, TextLink } from "@smog/ui-web";
import type { ReactNode } from "react";

const AUTHOR_URL = "https://zias.be";

/** Legal links, contact and the credit line. */
export function Footer(): ReactNode {
  const { t } = useTranslation();
  return (
    <footer className="border-border-subtle border-t bg-surface">
      <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <Logo decorative size="sm" tone="foreground" />
        <nav aria-label={t("nav.legal")}>
          <ul className="-mx-4 flex flex-wrap items-center gap-x-1 gap-y-2">
            <li>
              <Button asChild variant="ghost">
                <a href="/privacy">{t("nav.privacy")}</a>
              </Button>
            </li>
            <li>
              <Button asChild variant="ghost">
                <a href="/terms">{t("nav.terms")}</a>
              </Button>
            </li>
            <li>
              <Button asChild variant="ghost">
                <a href={`mailto:${CONTACT_EMAIL}`}>{t("nav.contact")}</a>
              </Button>
            </li>
          </ul>
        </nav>
        <Text size="body-sm" tone="muted">
          <TextLink href={AUTHOR_URL} tone="muted">
            {t("footer.madeBy")}
          </TextLink>
        </Text>
      </div>
    </footer>
  );
}
