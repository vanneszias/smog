import { Text } from "react-email";
import { styles } from "../../theme";
import {
  ActionLink,
  DetailsBox,
  EmailLayout,
  Footer,
  StepsBox,
} from "../layout";
import type { EmailTemplate } from "../types";

export interface AdminDeadLetterProps {
  /** Dead letters from the email queue that nobody replayed or discarded. */
  emailOpen: number;
  /** The same for the sponsorship events queue. */
  eventsOpen: number;
  /** Messages lost while D1 was down since the last digest (`[dlq] lost`). */
  lost: number;
  /** Sponsorships stuck in `render_failed` for more than 24 hours. */
  renderFailed: number;
  /**
   * The open dead letters by type (an email template id or an event type),
   * at most 10: types and counts only, never a body or an address.
   */
  types: { count: number; type: string }[];
  /** `/admin/dead-letters`. */
  url: string;
}

/**
 * `admin_dead_letter` (phase 9 ruling 5): the daily digest to every admin
 * when dead letters wait, messages were lost, or a render has been failed
 * for more than a day (`admin_dead_letter:<yyyy-mm-dd>:<adminId>`). Counts
 * and types only.
 */
export const adminDeadLetter: EmailTemplate<AdminDeadLetterProps> = {
  render: (
    { emailOpen, eventsOpen, lost, renderFailed, types, url },
    context
  ) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.adminDeadLetter.heading")}
        preheader={t("email.transactional.adminDeadLetter.preheader")}
      >
        <Text style={styles.text}>
          {t("email.transactional.adminDeadLetter.body")}
        </Text>
        <DetailsBox
          rows={[
            {
              label: t("email.transactional.adminDeadLetter.emailOpen"),
              value: String(emailOpen),
            },
            {
              label: t("email.transactional.adminDeadLetter.eventsOpen"),
              value: String(eventsOpen),
            },
            {
              label: t("email.transactional.adminDeadLetter.lost"),
              value: String(lost),
            },
            {
              label: t("email.transactional.adminDeadLetter.renderFailed"),
              value: String(renderFailed),
            },
          ]}
        />
        {types.length > 0 ? (
          <StepsBox
            numbered={false}
            steps={types.map(
              (entry) => `${entry.type}: ${String(entry.count)}`
            )}
            title={t("email.transactional.adminDeadLetter.types")}
          />
        ) : null}
        <ActionLink
          label={t("email.transactional.adminDeadLetter.button")}
          t={t}
          url={url}
        />
        <Footer>{t("email.common.adminFooter")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.adminDeadLetter.subject"),
};
