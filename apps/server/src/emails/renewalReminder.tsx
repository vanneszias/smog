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

interface RenewalReminderEmailProps {
  sponsorName: string;
  gestureName: string;
  endDate: number;
}

export function RenewalReminderEmail({
  sponsorName,
  gestureName,
  endDate,
}: RenewalReminderEmailProps) {
  const expiryDate = new Date(endDate).toLocaleDateString("nl-BE", {
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
          Je SMOG-sponsoring voor "{gestureName}" verloopt op {expiryDate}
        </Preview>
      }
    >
      <Heading style={S.h1}>Je sponsoring verloopt binnenkort</Heading>

      <Text style={S.text}>Hallo {sponsorName},</Text>

      <Text style={S.text}>
        Dit is een vriendelijke herinnering dat je sponsoring van het gebaar{" "}
        <strong>{gestureName}</strong> op de SMOG & CO app afloopt op{" "}
        <strong>{expiryDate}</strong>.
      </Text>

      <Text style={S.text}>
        Na deze datum keert het gebaar terug naar de originele video en wordt
        jouw uitstraling niet langer getoond aan bezoekers.
      </Text>

      <Text style={S.text}>
        Door de sponsoring te verlengen, blijft het gebaar jouw uitstraling
        tonen en blijf je ons steunen om SMOG & CO verder uit te bouwen in
        België.
      </Text>

      <Text style={S.text}>
        We hopen je te mogen blijven verwelkomen als sponsor van {gestureName}!
      </Text>

      <Section style={S.buttonSection}>
        <Button href={webUrl} style={S.button}>
          Verlengen kan via deze link
        </Button>
      </Section>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Je ontvangt deze e-mail omdat je sponsoring over ongeveer 7 dagen
        afloopt. Heb je al verlengd? Dan kun je deze e-mail negeren.
      </Text>
    </EmailLayout>
  );
}
