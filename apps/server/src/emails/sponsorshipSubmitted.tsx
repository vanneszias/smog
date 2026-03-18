import { Heading, Hr, Preview, Section, Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import * as S from "./styles";

interface SponsorshipSubmittedEmailProps {
  sponsorName: string;
  gestureName: string;
}

export function SponsorshipSubmittedEmail({
  sponsorName,
  gestureName,
}: SponsorshipSubmittedEmailProps) {
  const webUrl = process.env.CORS_ORIGIN ?? "https://app.smog.vlaanderen";

  return (
    <EmailLayout
      baseUrl={webUrl}
      preview={
        <Preview>
          We hebben je sponsoring voor "{gestureName}" ontvangen
        </Preview>
      }
    >
      <Heading style={S.h1}>Sponsoring ontvangen</Heading>

      <Text style={S.text}>Hallo {sponsorName},</Text>

      <Text style={S.text}>
        Bedankt voor het sponsoren van het gebaar <strong>{gestureName}</strong>{" "}
        op SMOG! We hebben je aanvraag ontvangen en ons team zal deze binnenkort
        beoordelen.
      </Text>

      <Section style={S.infoBox}>
        <Text
          style={{ ...S.textSmall, fontWeight: "700", marginBottom: "10px" }}
        >
          Wat gebeurt er nu?
        </Text>
        <Text style={S.textSmall}>
          1. We beoordelen je gesponsorde video om er zeker van te zijn dat
          alles er goed uitziet.
        </Text>
        <Text style={S.textSmall}>
          2. Na goedkeuring gaat je sponsoring live en wordt het gebaar{" "}
          <strong>{gestureName}</strong> weergegeven met jouw uitstraling.
        </Text>
        <Text style={{ ...S.textSmall, margin: "0" }}>
          3. Je ontvangt een bevestigingsmail zodra alles live staat.
        </Text>
      </Section>

      <Text style={S.text}>
        Heb je in de tussentijd vragen? Neem gerust contact met ons op.
      </Text>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Je ontvangt deze e-mail omdat je onlangs een sponsoring hebt ingediend
        via SMOG.
      </Text>
    </EmailLayout>
  );
}

export default SponsorshipSubmittedEmail;
