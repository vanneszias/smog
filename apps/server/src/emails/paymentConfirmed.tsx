import {
  Column,
  Heading,
  Hr,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import * as S from "./styles";

interface PaymentConfirmedEmailProps {
  sponsorName: string;
  gestureName: string;
  paymentAmount: number;
}

export function PaymentConfirmedEmail({
  sponsorName,
  gestureName,
  paymentAmount,
}: PaymentConfirmedEmailProps) {
  const formattedAmount = new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(paymentAmount / 100); // paymentAmount is in cents

  const webUrl = process.env.CORS_ORIGIN ?? "https://app.smog.vlaanderen";

  return (
    <EmailLayout
      baseUrl={webUrl}
      preview={
        <Preview>
          Betaling bevestigd — je sponsoring voor "{gestureName}" wordt
          beoordeeld
        </Preview>
      }
    >
      <Heading style={S.h1}>Betaling bevestigd</Heading>

      <Text style={S.text}>Hallo {sponsorName},</Text>

      <Text style={S.text}>
        We hebben je betaling voor de sponsoring van{" "}
        <strong>{gestureName}</strong> ontvangen. Hartelijk bedankt!
      </Text>

      <Section style={S.receiptBox}>
        <Row>
          <Column style={S.detailLabel}>Gebaar</Column>
          <Column style={S.detailValue}>{gestureName}</Column>
        </Row>
        <Row>
          <Column style={S.detailLabel}>Betaald bedrag</Column>
          <Column style={S.detailValue}>{formattedAmount}</Column>
        </Row>
      </Section>

      <Text style={S.text}>
        Ons team zal je gesponsorde video nu beoordelen. Je hoort van ons zodra
        deze live gaat — normaal binnen 1 à 2 werkdagen.
      </Text>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Bewaar deze e-mail als betaalbewijs. Heb je een factuur nodig? Neem dan
        contact met ons op.
      </Text>
    </EmailLayout>
  );
}
