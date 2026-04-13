import {
  Button,
  Heading,
  Hr,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import * as S from "./styles";

interface AdminNewSponsorshipEmailProps {
  sponsorName: string;
  sponsorEmail: string;
  gestureNames: string[];
  adminPanelUrl?: string;
  contactFullName: string;
  contactCompany?: string;
  invoiceRequested?: boolean;
  invoiceName?: string;
  invoiceVatNumber?: string;
  invoiceEmail?: string;
  durationYears?: number;
}

export function AdminNewSponsorshipEmail({
  sponsorName,
  sponsorEmail,
  gestureNames,
  adminPanelUrl,
  contactFullName,
  contactCompany,
  invoiceRequested,
  invoiceName,
  invoiceVatNumber,
  invoiceEmail,
  durationYears,
}: AdminNewSponsorshipEmailProps) {
  const webUrl = process.env.CORS_ORIGIN ?? "https://app.smog.vlaanderen";
  const panelUrl = adminPanelUrl ?? `${webUrl}/admin`;
  const gestureCount = gestureNames.length;
  const gestureLabel =
    gestureCount === 1 ? gestureNames[0]! : `${gestureCount} gebaren`;

  return (
    <EmailLayout
      baseUrl={webUrl}
      preview={
        <Preview>
          Nieuwe sponsoring van {sponsorName} — {gestureLabel} wacht op
          beoordeling
        </Preview>
      }
    >
      <Heading style={S.h1}>Nieuwe sponsoring ontvangen</Heading>

      <Text style={S.text}>
        Er is een nieuwe sponsoring ingediend en staat klaar voor beoordeling.
      </Text>

      <Section style={S.infoBox}>
        <Text
          style={{ ...S.textSmall, fontWeight: "700", marginBottom: "10px" }}
        >
          Sponsoring details
        </Text>
        <Text style={S.textSmall}>
          <strong>Sponsor:</strong> {sponsorName}
        </Text>
        <Text style={S.textSmall}>
          <strong>E-mail:</strong> {sponsorEmail}
        </Text>
        <Text style={{ ...S.textSmall, margin: "0" }}>
          <strong>{gestureCount === 1 ? "Gebaar" : "Gebaren"}:</strong>{" "}
          {gestureNames.join(", ")}
        </Text>
      </Section>

      <Section style={{ ...S.infoBox, marginTop: "12px" }}>
        <Text
          style={{ ...S.textSmall, fontWeight: "700", marginBottom: "10px" }}
        >
          Facturatie
        </Text>
        <Text style={S.textSmall}>
          <strong>Contactpersoon:</strong> {contactFullName}
          {contactCompany ? ` (${contactCompany})` : ""}
        </Text>
        <Text style={S.textSmall}>
          <strong>Looptijd:</strong> {durationYears ?? 1} jaar
        </Text>
        <Text style={S.textSmall}>
          <strong>Factuur gevraagd:</strong> {invoiceRequested ? "Ja" : "Nee"}
        </Text>
        {invoiceRequested && (
          <>
            {invoiceName && (
              <Text style={S.textSmall}>
                <strong>Factuurnaam:</strong> {invoiceName}
              </Text>
            )}
            {invoiceVatNumber && (
              <Text style={S.textSmall}>
                <strong>BTW-nummer:</strong> {invoiceVatNumber}
              </Text>
            )}
            <Text style={{ ...S.textSmall, margin: "0" }}>
              <strong>Factuur e-mail:</strong> {invoiceEmail ?? sponsorEmail}
            </Text>
          </>
        )}
      </Section>

      <Section style={S.buttonSection}>
        <Button href={panelUrl} style={S.button}>
          Bekijk in het admin panel
        </Button>
      </Section>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Je ontvangt deze e-mail omdat je een beheerdersrol hebt bij SMOG & CO.
      </Text>
    </EmailLayout>
  );
}

export default AdminNewSponsorshipEmail;
