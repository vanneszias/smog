import { Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting } from "../layout";
import type { EmailTemplate } from "../types";

export interface ResetPasswordProps {
  /** Link lifetime in minutes. */
  minutes: number;
  name?: string | null | undefined;
  url: string;
}

/** `auth_reset_password`: choose a (first or new) password. */
export const resetPassword: EmailTemplate<ResetPasswordProps> = {
  render: ({ minutes, name, url }, context) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.auth.resetPassword.heading")}
        preheader={t("email.auth.resetPassword.preheader")}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>{t("email.auth.resetPassword.body")}</Text>
        <ActionLink
          label={t("email.auth.resetPassword.button")}
          t={t}
          url={url}
        />
        <Text style={styles.footer}>
          {t("email.auth.resetPassword.expiry", { minutes })}
        </Text>
        <Footer>{t("email.auth.resetPassword.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.auth.resetPassword.subject"),
};
