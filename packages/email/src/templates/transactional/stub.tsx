import { Text } from "react-email";
import { styles } from "../../theme";
import { EmailLayout } from "../layout";
import type { EmailTemplate } from "../types";

/** The `email.transactional.<key>` blocks (phase 6). */
export type TransactionalKey =
  | "welcome"
  | "sponsorshipReceived"
  | "paymentConfirmed"
  | "sponsorshipLive"
  | "renewalReminder"
  | "adminNewSponsorship"
  | "adminRenderFailed"
  | "adminRefundNeeded";

/**
 * A placeholder template: the subject and one paragraph from
 * `email.transactional.<key>`. Phase 6 task 1 registers the eight
 * transactional templates with their final props through this, so every
 * producer type-checks; task 2 replaces each with its real design.
 */
export function stubTemplate<Props>(
  key: TransactionalKey
): EmailTemplate<Props> {
  return {
    render: (_props, { locale, t }) => (
      <EmailLayout
        heading={t(`email.transactional.${key}.subject`)}
        locale={locale}
        preheader={t(`email.transactional.${key}.body`)}
        t={t}
      >
        <Text style={styles.text}>{t(`email.transactional.${key}.body`)}</Text>
      </EmailLayout>
    ),
    subject: (_props, { t }) => t(`email.transactional.${key}.subject`),
  };
}
