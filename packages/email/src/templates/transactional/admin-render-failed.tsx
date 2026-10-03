import { Text } from "react-email";
import { styles } from "../../theme";
import { errorSummary, gestureValue } from "../format";
import { ActionLink, DetailsBox, EmailLayout, Footer } from "../layout";
import type { EmailTemplate } from "../types";

export interface AdminRenderFailedProps {
  displayName: string;
  /** The error summary (at most 300 characters, no stack). */
  error: string;
  gestureName: string | null;
  /** `/admin/sponsorships/<id>`. */
  url: string;
}

/**
 * `admin_render_failed` (E-07): to every admin when a render fails after
 * its retries, with the error summary (cut to 300 characters here too)
 * and the link to the detail (`admin_render_failed:<renderJobId>:<adminId>`).
 */
export const adminRenderFailed: EmailTemplate<AdminRenderFailedProps> = {
  render: ({ displayName, error, gestureName, url }, context) => {
    const { locale, t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.adminRenderFailed.heading")}
        preheader={t("email.transactional.adminRenderFailed.preheader", {
          displayName,
        })}
      >
        <Text style={styles.text}>
          {t("email.transactional.adminRenderFailed.body")}
        </Text>
        <DetailsBox
          rows={[
            {
              label: t("email.common.fields.gesture"),
              value: gestureValue(t, locale, gestureName),
            },
            { label: t("email.common.fields.displayName"), value: displayName },
          ]}
        />
        <Text style={styles.boxTitle}>{t("email.common.fields.error")}</Text>
        <Text style={styles.pre}>{errorSummary(error)}</Text>
        <ActionLink
          label={t("email.transactional.adminRenderFailed.button")}
          t={t}
          url={url}
        />
        <Footer>{t("email.common.adminFooter")}</Footer>
      </EmailLayout>
    );
  },
  subject: ({ gestureName }, { locale, t }) =>
    t("email.transactional.adminRenderFailed.subject", {
      gesture: gestureValue(t, locale, gestureName),
    }),
};
