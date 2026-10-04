import { Link, Text } from "react-email";
import { styles } from "../../theme";
import { ActionLink, EmailLayout, Footer, Greeting, StepsBox } from "../layout";
import type { EmailTemplate } from "../types";

/** The old system's origin (phase 8 ruling 15): no "new address" on it. */
export const WE_MOVED_OLD_ORIGIN = "https://app.smog.vlaanderen";

/** A social sign-in provider production has configured. */
export type WeMovedProvider = "google" | "apple";

export interface WeMovedProps {
  /**
   * The social sign-ins production offers (`we-moved` reads them from
   * production's secrets, as `@smog/auth` enables them): the provider
   * line names only these, and is left out without any.
   */
  providers: readonly WeMovedProvider[];
  /** The site (`SITE_URL`): where the account now lives. */
  url: string;
}

const PROVIDER_LINE = {
  apple: "email.transactional.weMoved.signInApple",
  both: "email.transactional.weMoved.signInGoogleApple",
  google: "email.transactional.weMoved.signInGoogle",
} as const;

function providerLine(
  providers: readonly WeMovedProvider[]
): (typeof PROVIDER_LINE)[keyof typeof PROVIDER_LINE] | null {
  const google = providers.includes("google");
  const apple = providers.includes("apple");
  if (google && apple) {
    return PROVIDER_LINE.both;
  }
  if (google) {
    return PROVIDER_LINE.google;
  }
  return apple ? PROVIDER_LINE.apple : null;
}

/**
 * `we_moved` (E-13, phase 8 ruling 15): sent once to every migrated
 * account at cutover by `migrate:convex we-moved`. The copy derives from
 * `SITE_URL`: the "new address" sentence shows only when its origin is
 * not the old `https://app.smog.vlaanderen` (dropped on the domain path).
 * It says how to sign in without the old password (Google and Apple only
 * when production has them), that favorites and lists moved, and that the
 * app needs an update. No name: the recipients come from D1 as id, email
 * and locale only.
 */
export const weMoved: EmailTemplate<WeMovedProps> = {
  render: ({ providers, url }, context) => {
    const { t } = context;
    const site = new URL(url);
    const moved = site.origin !== WE_MOVED_OLD_ORIGIN;
    const providerKey = providerLine(providers);
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
            ...(providerKey ? [t(providerKey)] : []),
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
