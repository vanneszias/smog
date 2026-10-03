import { Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting } from "../layout";
import type { EmailTemplate } from "../types";

export interface VerifyEmailProps {
  /** Link lifetime in minutes. */
  minutes: number;
  url: string;
}

/**
 * `auth_verify_email`: confirm the address after sign-up. It goes to an
 * address the sender has not proven to own, so it never shows the
 * sign-up name (which could carry a phishing message).
 */
export const verifyEmail: EmailTemplate<VerifyEmailProps> = {
  render: ({ minutes, url }, context) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.auth.verifyEmail.heading")}
        preheader={t("email.auth.verifyEmail.preheader")}
      >
        <Greeting t={t} />
        <Text style={styles.text}>{t("email.auth.verifyEmail.body")}</Text>
        <ActionLink
          label={t("email.auth.verifyEmail.button")}
          t={t}
          url={url}
        />
        <Text style={styles.footer}>
          {t("email.auth.verifyEmail.expiry", { minutes })}
        </Text>
        <Footer>{t("email.auth.verifyEmail.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.auth.verifyEmail.subject"),
};
