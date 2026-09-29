import { Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer } from "../layout";
import type { EmailTemplate } from "../types";

export interface MagicLinkProps {
  /** Link lifetime in minutes. */
  minutes: number;
  url: string;
}

/** `auth_magic_link`: a one-time sign-in link. */
export const magicLink: EmailTemplate<MagicLinkProps> = {
  render: ({ minutes, url }, { locale, t }) => (
    <EmailLayout
      heading={t("email.auth.magicLink.heading")}
      locale={locale}
      preheader={t("email.auth.magicLink.preheader")}
      t={t}
    >
      <Text style={styles.text}>{t("email.auth.magicLink.body")}</Text>
      <ActionLink label={t("email.auth.magicLink.button")} t={t} url={url} />
      <Text style={styles.footer}>
        {t("email.auth.magicLink.expiry", { minutes })}
      </Text>
      <Footer>{t("email.auth.magicLink.footer")}</Footer>
    </EmailLayout>
  ),
  subject: (_props, { t }) => t("email.auth.magicLink.subject"),
};
