import {
  Button,
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

interface SponsorshipLiveEmailProps {
  sponsorName: string;
  gestureName: string;
  startDate: number;
  endDate: number;
}

export function SponsorshipLiveEmail({
  sponsorName,
  gestureName,
  startDate,
  endDate,
}: SponsorshipLiveEmailProps) {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const webUrl = process.env.CORS_ORIGIN ?? "https://app.smog.vlaanderen";

  return (
    <EmailLayout
      baseUrl={webUrl}
      preview={
        <Preview>
          Je sponsoring voor "{gestureName}" is nu live op SMOG!
        </Preview>
      }
    >
      <Heading style={S.h1}>Je sponsoring is live!</Heading>

      <Text style={S.text}>Hallo {sponsorName},</Text>

      <Text style={S.text}>
        Goed nieuws — je sponsoring voor het gebaar{" "}
        <strong>{gestureName}</strong> is goedgekeurd en staat nu live op SMOG.
        Bezoekers die dit gebaar opzoeken, zien nu jouw uitstraling.
      </Text>

      <Section style={S.receiptBox}>
        <Row>
          <Column style={S.detailLabel}>Gebaar</Column>
          <Column style={S.detailValue}>{gestureName}</Column>
        </Row>
        <Row>
          <Column style={S.detailLabel}>Actief vanaf</Column>
          <Column style={S.detailValue}>{fmt(startDate)}</Column>
        </Row>
        <Row>
          <Column style={S.detailLabel}>Actief tot</Column>
          <Column style={S.detailValue}>{fmt(endDate)}</Column>
        </Row>
      </Section>

      <Section style={S.buttonSection}>
        <Button href={webUrl} style={S.button}>
          Bekijk op SMOG
        </Button>
      </Section>

      <Text style={S.text}>
        Bedankt dat je de gebarentaalgemeenschap ondersteunt via SMOG. Je
        sponsoring maakt echt een verschil.
      </Text>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Je ontvangt een herinnering voordat je sponsoring afloopt, zodat je deze
        eventueel kunt verlengen.
      </Text>
    </EmailLayout>
  );
}

export default SponsorshipLiveEmail;
