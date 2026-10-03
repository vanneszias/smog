import { Text } from "react-email";
import { styles } from "../../theme";
import { emailDate, gesturePhrase } from "../format";
import { ActionLink, EmailLayout, Footer, Greeting } from "../layout";
import type { EmailTemplate } from "../types";

export interface RenewalReminderProps {
  /** `sponsorship.ends_at` (ISO 8601). */
  endsAt: string;
  gestureName: string | null;
  name: string;
  /** `/sponsor/renew?token=<raw token>`. */
  url: string;
}

/**
 * `renewal_reminder` (E-05): 30 days before the end, with the renewal link
 * (bug 2: the old email said "about 7 days" and linked to the homepage)
 * (`renewal_reminder:<sponsorshipId>:<endsAt>`).
 */
export const renewalReminder: EmailTemplate<RenewalReminderProps> = {
  render: ({ endsAt, gestureName, name, url }, context) => {
    const { locale, t } = context;
    const date = emailDate(endsAt, locale);
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.renewalReminder.heading")}
        preheader={t("email.transactional.renewalReminder.preheader", {
          date,
        })}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>
          {t("email.transactional.renewalReminder.body", {
            date,
            gesture: gesturePhrase(t, gestureName),
          })}
        </Text>
        <Text style={styles.text}>
          {t("email.transactional.renewalReminder.renew")}
        </Text>
        <ActionLink
          label={t("email.transactional.renewalReminder.button")}
          t={t}
          url={url}
        />
        <Text style={styles.text}>{t("email.common.questions")}</Text>
        <Footer>{t("email.transactional.renewalReminder.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.renewalReminder.subject"),
};
