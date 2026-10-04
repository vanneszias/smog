import { Link, Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting, StepsBox } from "../layout";
import type { EmailTemplate } from "../types";

/** The old system's origin (phase 8 ruling 15): no "new address" on it. */
export const WE_MOVED_OLD_ORIGIN = "https://app.smog.vlaanderen";

export interface WeMovedProps {
  /** The site (`SITE_URL`): where the account now lives. */
  url: string;
}

/**
 * `we_moved` (E-13, phase 8 ruling 15): sent once to every migrated
 * account at cutover by `migrate:convex we-moved`. The copy derives from
 * `SITE_URL`: the "new address" sentence shows only when its origin is
 * not the old `https://app.smog.vlaanderen` (dropped on the domain path).
 * It says how to sign in without the old password, that favorites and
 * lists moved, and that the app needs an update. No name: the recipients
 * come from D1 as id, email and locale only.
 */
export const weMoved: EmailTemplate<WeMovedProps> = {
  render: ({ url }, context) => {
    const { t } = context;
    const site = new URL(url);
    const moved = site.origin !== WE_MOVED_OLD_ORIGIN;
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.weMoved.heading")}
        preheader={t("email.transactional.weMoved.preheader")}
      >
        <Greeting t={t} />
        <Text style={styles.text}>{t("email.transactional.weMoved.body")}</Text>
        {moved ? (
          <Text style={styles.text}>
            {t("email.transactional.weMoved.newAddress")}{" "}
            <Link href={site.origin} style={styles.link}>
              {site.host}
            </Link>
          </Text>
        ) : null}
        <StepsBox
          numbered={false}
          steps={[
            t("email.transactional.weMoved.signInCode"),
            t("email.transactional.weMoved.signInLink"),
            t("email.transactional.weMoved.signInProvider"),
            t("email.transactional.weMoved.signInReset"),
          ]}
          title={t("email.transactional.weMoved.signInTitle")}
        />
        <Text style={styles.text}>{t("email.transactional.weMoved.app")}</Text>
        <ActionLink
          label={t("email.transactional.weMoved.button")}
          t={t}
          url={new URL("/sign-in", site.origin).toString()}
        />
        <Footer>{t("email.transactional.weMoved.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.weMoved.subject"),
};
