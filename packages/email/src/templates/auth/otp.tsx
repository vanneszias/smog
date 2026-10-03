import { Text } from "react-email";
import { styles } from "../../theme";
import { EmailLayout, Footer } from "../layout";
import type { EmailTemplate } from "../types";

export interface OtpProps {
  code: string;
  /** Code lifetime in minutes. */
  minutes: number;
}

/** `auth_otp`: a one-time sign-in or verification code. */
export const otp: EmailTemplate<OtpProps> = {
  render: ({ code, minutes }, context) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.auth.otp.heading")}
        preheader={t("email.auth.otp.preheader", { code })}
      >
        <Text style={styles.text}>{t("email.auth.otp.body")}</Text>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.footer}>
          {t("email.auth.otp.expiry", { minutes })}
        </Text>
        <Footer>{t("email.auth.otp.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: ({ code }, { t }) => t("email.auth.otp.subject", { code }),
};
