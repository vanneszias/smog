import { Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting } from "../layout";
import type { EmailTemplate } from "../types";

export interface VerifyEmailProps {
  /** Link lifetime in minutes. */
  minutes: number;
  name?: string | null | undefined;
  url: string;
}

/** `auth_verify_email`: confirm the address after sign-up. */
export const verifyEmail: EmailTemplate<VerifyEmailProps> = {
  render: ({ minutes, name, url }, { locale, t }) => (
    <EmailLayout
      heading={t("email.auth.verifyEmail.heading")}
      locale={locale}
      preheader={t("email.auth.verifyEmail.preheader")}
      t={t}
    >
      <Greeting name={name} t={t} />
      <Text style={styles.text}>{t("email.auth.verifyEmail.body")}</Text>
      <ActionLink label={t("email.auth.verifyEmail.button")} t={t} url={url} />
      <Text style={styles.footer}>
        {t("email.auth.verifyEmail.expiry", { minutes })}
      </Text>
      <Footer>{t("email.auth.verifyEmail.footer")}</Footer>
    </EmailLayout>
  ),
  subject: (_props, { t }) => t("email.auth.verifyEmail.subject"),
};
