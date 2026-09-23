import { Button, Input, Text } from "@smog/ui-native";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { payloadFetch } from "@/lib/api";

/**
 * The one thing this screen is allowed to say, whether or not the address
 * is registered. `POST /api/users/forgot-password` is Payload's own
 * `forgotPasswordHandler`, unmodified, and it already answers every address with the same `200 { message }`
 * regardless of whether an account exists
 * (`payload/dist/auth/endpoints/forgotPassword.js` never branches on the
 * operation's result). This screen keeps that property rather than adding
 * a client-side reason to break it.
 */
const NEUTRAL_NOTICE =
  "Als dat e-mailadres bij ons bekend is, ontvang je een e-mail met verdere instructies.";
const NETWORK_ERROR =
  "Er ging iets mis bij het verzenden. Controleer je internetverbinding en probeer het opnieuw.";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"sent" | "error" | null>(null);

  const onSubmit = async () => {
    setSubmitting(true);
    setResult(null);

    try {
      await payloadFetch("/users/forgot-password", {
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setResult("sent");
    } catch {
      // A network failure, not a fact about the address — safe to say so.
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-lg bg-background p-lg">
      <Text size="xl" variant="heading">
        Wachtwoord vergeten
      </Text>

      {result === "sent" ? (
        <Text testID="forgot-password-notice">{NEUTRAL_NOTICE}</Text>
      ) : null}
      {result === "error" ? (
        <Text className="text-danger" testID="forgot-password-error">
          {NETWORK_ERROR}
        </Text>
      ) : null}

      <Input
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label="E-mailadres"
        onChangeText={setEmail}
        testID="email"
        value={email}
      />

      <Button loading={submitting} onPress={onSubmit} testID="submit">
        Verzenden
      </Button>

      <Link href="/sign-in">
        <Text variant="muted">Terug naar aanmelden</Text>
      </Link>
    </View>
  );
}
