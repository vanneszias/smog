import { Text } from "react-email";
import { styles } from "../../theme";
import { gesturePhrase } from "../format";
import { EmailLayout, Footer, Greeting, StepsBox } from "../layout";
import type { EmailTemplate } from "../types";

export interface SponsorshipReceivedProps {
  /** The name shown in the video. */
  displayName: string;
  /** The gesture's name; `null` falls back to `email.common.yourGesture` (bug 28). */
  gestureName: string | null;
  /** The sponsor's contact name. */
  name: string;
}

/**
 * `sponsorship_received` (E-02): one per sponsorship after payment
 * (`sponsorship_received:<sponsorshipId>`), with what happens next: the
 * render, the review, and the email when it is live.
 */
export const sponsorshipReceived: EmailTemplate<SponsorshipReceivedProps> = {
  render: ({ displayName, gestureName, name }, context) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.sponsorshipReceived.heading")}
        preheader={t("email.transactional.sponsorshipReceived.preheader")}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>
          {t("email.transactional.sponsorshipReceived.body", {
            displayName,
            gesture: gesturePhrase(t, gestureName),
          })}
        </Text>
        <StepsBox
          steps={[
            t("email.transactional.sponsorshipReceived.stepRender"),
            t("email.transactional.sponsorshipReceived.stepReview"),
            t("email.transactional.sponsorshipReceived.stepLive"),
          ]}
          title={t("email.transactional.sponsorshipReceived.nextTitle")}
        />
        <Text style={styles.text}>{t("email.common.questions")}</Text>
        <Footer>{t("email.transactional.sponsorshipReceived.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) =>
    t("email.transactional.sponsorshipReceived.subject"),
};
