import { Text } from "react-email";
import { styles } from "../../theme";
import { emailDate, gesturePhrase, gestureValue } from "../format";
import {
  ActionLink,
  DetailsBox,
  EmailLayout,
  Footer,
  Greeting,
} from "../layout";
import type { EmailTemplate } from "../types";

export interface SponsorshipLiveProps {
  displayName: string;
  /** `sponsorship.ends_at` (ISO 8601). */
  endsAt: string;
  gestureName: string | null;
  name: string;
  /** `sponsorship.starts_at` (ISO 8601). */
  startsAt: string;
  /** The gesture's page. */
  url: string;
}

/**
 * `sponsorship_live` (E-04): after approval, with the stored `starts_at`
 * and `ends_at` (bug 1: the old email showed the dates read before the
 * approval) (`sponsorship_live:<sponsorshipId>:<startsAt>`).
 */
export const sponsorshipLive: EmailTemplate<SponsorshipLiveProps> = {
  render: (
    { displayName, endsAt, gestureName, name, startsAt, url },
    context
  ) => {
    const { locale, t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.sponsorshipLive.heading")}
        preheader={t("email.transactional.sponsorshipLive.preheader")}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>
          {t("email.transactional.sponsorshipLive.body", {
            displayName,
            gesture: gesturePhrase(t, gestureName),
          })}
        </Text>
        <DetailsBox
          rows={[
            {
              label: t("email.common.fields.gesture"),
              value: gestureValue(t, locale, gestureName),
            },
            {
              label: t("email.common.fields.activeFrom"),
              value: emailDate(startsAt, locale),
            },
            {
              label: t("email.common.fields.activeUntil"),
              value: emailDate(endsAt, locale),
            },
          ]}
        />
        <ActionLink
          label={t("email.transactional.sponsorshipLive.button")}
          t={t}
          url={url}
        />
        <Text style={styles.text}>
          {t("email.transactional.sponsorshipLive.thanks")}
        </Text>
        <Footer>{t("email.transactional.sponsorshipLive.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.sponsorshipLive.subject"),
};
