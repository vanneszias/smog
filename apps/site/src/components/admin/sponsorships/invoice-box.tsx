import type { AdminSponsorshipDetail } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { cn, Text } from "@smog/ui-web";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "Invoice requested" with the name, the enterprise number and the invoice
 * email (the organisation sends the invoice by hand, ruling 3), or "No
 * invoice". The number is stored as its 10 digits.
 */
export function InvoiceBox({
  invoice,
}: {
  invoice: AdminSponsorshipDetail["invoice"];
}): ReactNode {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="invoice-heading"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        invoice
          ? "border-warning bg-warning-subtle"
          : "border-border-subtle bg-surface-sunken"
      )}
    >
      <h2
        className={cn(
          "flex items-center gap-1.5 font-semibold text-body-sm",
          invoice ? "text-warning-strong" : "text-foreground-muted"
        )}
        id="invoice-heading"
      >
        <FileText aria-hidden="true" className="size-4" />
        {t(
          invoice
            ? "admin.sponsorships.invoice.requested"
            : "admin.sponsorships.invoice.none"
        )}
      </h2>
      {invoice ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-body-sm">
          <dt>
            <Text as="span" size="caption" tone="muted">
              {t("admin.sponsorships.invoice.name")}
            </Text>
          </dt>
          <dd className="min-w-0 break-words">{invoice.name}</dd>
          <dt>
            <Text as="span" size="caption" tone="muted">
              {t("admin.sponsorships.invoice.vat")}
            </Text>
          </dt>
          <dd className="font-mono tabular-nums">{invoice.vatNumber}</dd>
          <dt>
            <Text as="span" size="caption" tone="muted">
              {t("admin.sponsorships.invoice.email")}
            </Text>
          </dt>
          <dd className="min-w-0 break-words">{invoice.email}</dd>
        </dl>
      ) : null}
    </section>
  );
}
