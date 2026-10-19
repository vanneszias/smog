import { Text } from "react-email";
import { styles } from "../../theme";
import { emailMoney, formatVatNumber, gestureValue } from "../format";
import {
  ActionLink,
  type DetailRow,
  DetailsBox,
  EmailLayout,
  Footer,
} from "../layout";
import type { EmailTemplate } from "../types";

export interface AdminNewSponsorshipProps {
  contact: { company: string | null; email: string; name: string };
  displayName: string;
  /** Each gesture of the payment with its amount in integer cents. */
  gestures: { amountCents: number; name: string | null }[];
  /** The invoice request, or `null` for none. */
  invoice: { email: string; name: string; vatNumber: string } | null;
  kind: "initial" | "renewal";
  paymentId: string;
  totalCents: number;
  /** `/admin/sponsorships/<id>`, or `/admin/sponsorships?payment=<id>` for several. */
  url: string;
}

const KIND_KEYS = {
  initial: {
    body: "email.transactional.adminNewSponsorship.body",
    heading: "email.transactional.adminNewSponsorship.heading",
    subject: "email.transactional.adminNewSponsorship.subject",
  },
  renewal: {
    body: "email.transactional.adminNewSponsorship.bodyRenewal",
    heading: "email.transactional.adminNewSponsorship.headingRenewal",
    subject: "email.transactional.adminNewSponsorship.subjectRenewal",
  },
} as const;

/**
 * `admin_new_sponsorship` (E-06): to every admin after payment, not at
 * creation (D-ADMINMAIL), with the gestures and their amounts, the contact
 * and the invoice box the organisation invoices from by hand
 * (`admin_new_sponsorship:<paymentId>:<adminId>`).
 */
export const adminNewSponsorship: EmailTemplate<AdminNewSponsorshipProps> = {
  render: (props, context) => {
    const { locale, t } = context;
    const { contact, displayName, gestures, invoice, kind, paymentId } = props;
    const keys = KIND_KEYS[kind];
    const total = emailMoney(props.totalCents, locale);
    const details: DetailRow[] = [
      { label: t("email.common.fields.displayName"), value: displayName },
      { label: t("email.common.fields.email"), value: contact.email },
      {
        label: t("email.common.fields.gestures"),
        // One block per gesture: no `<br />`, which some clients pad with an
        // empty line at the end of the cell.
        value: gestures.map((gesture, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the payment's items, in order; two may share a missing name.
          <span key={index} style={styles.lineBlock}>
            {`${gestureValue(t, locale, gesture.name)} · ${emailMoney(gesture.amountCents, locale)}`}
          </span>
        )),
      },
      { label: t("email.common.fields.total"), value: total },
      { label: t("email.common.fields.payment"), value: paymentId },
    ];
    const billing: DetailRow[] = [
      {
        label: t("email.common.fields.contact"),
        value: contact.company
          ? t("email.common.contactWithCompany", {
              company: contact.company,
              name: contact.name,
            })
          : contact.name,
      },
      {
        label: t("email.common.fields.duration"),
        value: t("email.common.oneYear"),
      },
      {
        label: t("email.common.fields.invoiceRequested"),
        value: invoice ? t("email.common.yes") : t("email.common.no"),
      },
      ...(invoice
        ? [
            {
              label: t("email.common.fields.invoiceName"),
              value: invoice.name,
            },
            {
              label: t("email.common.fields.vatNumber"),
              value: formatVatNumber(invoice.vatNumber),
            },
            {
              label: t("email.common.fields.invoiceEmail"),
              value: invoice.email || contact.email,
            },
          ]
        : []),
    ];
    return (
      <EmailLayout
        context={context}
        heading={t(keys.heading)}
        preheader={t("email.transactional.adminNewSponsorship.preheader", {
          total,
        })}
      >
        <Text style={styles.text}>{t(keys.body)}</Text>
        <DetailsBox
          rows={details}
          title={t("email.transactional.adminNewSponsorship.detailsTitle")}
        />
        <DetailsBox
          rows={billing}
          title={t("email.transactional.adminNewSponsorship.invoiceTitle")}
        />
        <ActionLink
          label={t("email.transactional.adminNewSponsorship.button")}
          t={t}
          url={props.url}
        />
        <Footer>{t("email.common.adminFooter")}</Footer>
      </EmailLayout>
    );
  },
  subject: ({ displayName, kind }, { t }) =>
    t(KIND_KEYS[kind].subject, { name: displayName }),
};
