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
        <strong>{gestureName}</strong> op SMOG afloopt op{" "}
        <strong>{expiryDate}</strong>.
      </Text>

      <Text style={S.text}>
        Na deze datum keert het gebaar terug naar de originele video en wordt
        jouw uitstraling niet langer getoond aan bezoekers.
      </Text>

      <Section style={S.buttonSection}>
        <Button href={webUrl} style={S.button}>
          Verleng je sponsoring
        </Button>
      </Section>

      <Text style={S.text}>
        Bedankt voor je steun aan de gebarentaalgemeenschap. We hopen je te
        mogen blijven verwelkomen als sponsor van {gestureName}!
      </Text>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Je ontvangt deze e-mail omdat je sponsoring over ongeveer 30 dagen
        afloopt. Heb je al verlengd? Dan kun je deze e-mail negeren.
      </Text>
    </EmailLayout>
  );
}

export default RenewalReminderEmail;
