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

interface WelcomeEmailProps {
  name?: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  const greeting = name ? `Hallo ${name}` : "Welkom";
  const webUrl = process.env.CORS_ORIGIN ?? "https://app.smog.vlaanderen";

  return (
    <EmailLayout
      baseUrl={webUrl}
      preview={
        <Preview>
          Welkom bij SMOG — ontdek en sponsor gebaren uit de gebarentaal
        </Preview>
      }
    >
      <Heading style={S.h1}>Welkom bij SMOG</Heading>

      <Text style={S.text}>{greeting},</Text>

      <Text style={S.text}>
        Bedankt dat je je hebt aangemeld bij SMOG! We bouwen een platform dat
        gebarentaal toegankelijker en zichtbaarder maakt. Met jouw account kun
        je gebaren verkennen, je favorieten bewaren en de gebarentaalgemeenschap
        ondersteunen via sponsoringen.
      </Text>

      <Section style={S.buttonSection}>
        <Button href={webUrl} style={S.button}>
          Ontdek gebaren
        </Button>
      </Section>

      <Hr style={S.hr} />

      <Text style={S.footer}>
        Heb je dit account niet aangemaakt? Dan kun je deze e-mail gerust
        negeren.
      </Text>
    </EmailLayout>
  );
}

export default WelcomeEmail;
