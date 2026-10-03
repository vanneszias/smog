import { Text } from "react-email";
import { styles } from "../../theme";
import { emailDate, emailMoney, gestureValue } from "../format";
import {
  type DetailRow,
  DetailsBox,
  EmailLayout,
  Footer,
  Greeting,
} from "../layout";
import type { EmailTemplate } from "../types";

export interface PaymentConfirmedProps {
  /** This gesture's amount in integer cents (`payment_item.amount_cents`). */
  amountCents: number;
  /** For a renewal, the new end date (ISO 8601); `null` for an initial payment. */
  endsAt: string | null;
  gestureName: string | null;
  kind: "initial" | "renewal";
  name: string;
}

/**
 * `payment_confirmed` (E-03): one per gesture with that gesture's amount,
 * not the payment's total; also for renewals, with the new end date
 * (`payment_confirmed:<paymentId>:<sponsorshipId>`).
 */
export const paymentConfirmed: EmailTemplate<PaymentConfirmedProps> = {
  render: ({ amountCents, endsAt, gestureName, kind, name }, context) => {
    const { locale, t } = context;
    const amount = emailMoney(amountCents, locale);
    const renewedUntil =
      kind === "renewal" && endsAt ? emailDate(endsAt, locale) : null;
    const rows: DetailRow[] = [
      {
        label: t("email.common.fields.gesture"),
        value: gestureValue(t, locale, gestureName),
      },
      { label: t("email.common.fields.paidAmount"), value: amount },
      ...(renewedUntil
        ? [
            {
              label: t("email.common.fields.renewedUntil"),
              value: renewedUntil,
            },
          ]
        : []),
    ];
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.paymentConfirmed.heading")}
        preheader={t("email.transactional.paymentConfirmed.preheader", {
          amount,
        })}
      >
        <Greeting name={name} t={t} />
        <Text style={styles.text}>
          {t("email.transactional.paymentConfirmed.body")}
        </Text>
        <DetailsBox rows={rows} />
        <Text style={styles.text}>
          {renewedUntil
            ? t("email.transactional.paymentConfirmed.renewalNext", {
                date: renewedUntil,
              })
            : t("email.transactional.paymentConfirmed.initialNext")}
        </Text>
        <Footer>{t("email.transactional.paymentConfirmed.footer")}</Footer>
      </EmailLayout>
    );
  },
  subject: (_props, { t }) => t("email.transactional.paymentConfirmed.subject"),
};
