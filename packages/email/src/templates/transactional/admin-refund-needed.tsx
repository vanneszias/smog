import { Text } from "react-email";
import { styles } from "../../theme";
import { emailMoney } from "../format";
import { ActionLink, DetailsBox, EmailLayout, Footer } from "../layout";
import type { EmailTemplate } from "../types";

type RefundReason = "late" | "mismatch" | "double" | "chargeback";

export interface AdminRefundNeededProps {
  /**
   * In integer cents: the share to refund (late), what Mollie received
   * (mismatch, paid twice), or what the bank charged back (chargeback).
   */
  amountCents: number;
  paymentId: string;
  /**
   * Late (the gesture was taken), an amount mismatch, paid twice, or a
   * chargeback (sent as `admin_chargeback:<paymentId>:<cents>:<adminId>`).
   */
  reason: RefundReason;
  /** The payment's page in the Mollie dashboard. */
  url: string;
}

const REASON_KEYS = {
  chargeback: "email.transactional.adminRefundNeeded.reasonChargeback",
  double: "email.transactional.adminRefundNeeded.reasonDouble",
  late: "email.transactional.adminRefundNeeded.reasonLate",
  mismatch: "email.transactional.adminRefundNeeded.reasonMismatch",
} as const satisfies Record<RefundReason, string>;

/**
 * `admin_refund_needed` (E-08): to every admin when a payment must be
 * refunded by hand in the Mollie dashboard (ruling 4), with the payment,
 * the amount, the reason and the dashboard link
 * (`admin_refund_needed:<paymentId>:<adminId>`).
 */
export const adminRefundNeeded: EmailTemplate<AdminRefundNeededProps> = {
  render: ({ amountCents, paymentId, reason, url }, context) => {
    const { locale, t } = context;
    const amount = emailMoney(amountCents, locale);
    return (
      <EmailLayout
        context={context}
        heading={t("email.transactional.adminRefundNeeded.heading")}
        preheader={t("email.transactional.adminRefundNeeded.preheader", {
          amount,
        })}
      >
        <Text style={styles.text}>
          {t("email.transactional.adminRefundNeeded.body")}
        </Text>
        <DetailsBox
          rows={[
            { label: t("email.common.fields.payment"), value: paymentId },
            { label: t("email.common.fields.amount"), value: amount },
            {
              label: t("email.common.fields.reason"),
              value: t(REASON_KEYS[reason]),
            },
          ]}
        />
        <Text style={styles.text}>
          {t("email.transactional.adminRefundNeeded.steps")}
        </Text>
        <ActionLink
          label={t("email.transactional.adminRefundNeeded.button")}
          t={t}
          url={url}
        />
        <Footer>{t("email.common.adminFooter")}</Footer>
      </EmailLayout>
    );
  },
  subject: ({ paymentId }, { t }) =>
    t("email.transactional.adminRefundNeeded.subject", { paymentId }),
};
