import { Link, Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting, StepsBox } from "../layout";
import type { EmailTemplate } from "../types";

export interface WelcomeProps {
  /** The account's name, or `null`. */
  name: string | null;
  /** The site (`SITE_URL`). */
  url: string;
}

/**
 * `welcome` (E-01): sent once per account when its email becomes verified
 * (`welcome:<userId>`): what the site offers, and the way to sponsoring.
 */
export const welcome: EmailTemplate<WelcomeProps> = {
  render: ({ name, url }, context) => {
    const { t } = context;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.welcome.heading")}
        preheader={t("email.transactional.welcome.preheader")}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>{t("email.transactional.welcome.body")}</Text>
        <StepsBox
          numbered={false}
          steps={[
            t("email.transactional.welcome.explore"),
            t("email.transactional.welcome.favorites"),
            <Link
              href={new URL("/sponsor", url).toString()}
              key="sponsor"
              style={styles.link}
            >
              {t("email.transactional.welcome.sponsor")}
            </Link>,
          ]}
        />
        <ActionLink
          label={t("email.transactional.welcome.button")}
          t={t}
          url={url}
        />
        <Footer>{t("email.transactional.welcome.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.welcome.subject"),
};
