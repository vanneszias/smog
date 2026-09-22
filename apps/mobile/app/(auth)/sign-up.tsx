import { Button, Input, Text } from "@smog/ui-native";
import { Link, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { signUp } from "@/lib/session";

/**
 * One message for both of `hooks/enforcePasswordPolicy`'s rules — too
 * short and too guessable — mirroring the web sign-up page's own wording.
 * The endpoint answers with a code (`"weak-password"`), never with text of
 * its own, so nothing shown here can be chosen by whoever this screen's
 * copy came from.
 */
const PASSWORD_ERROR =
  "Kies een wachtwoord van minstens 12 tekens dat niet makkelijk te raden is.";
const EMAIL_ERROR = "Vul een geldig e-mailadres in.";
const PASSWORD_HELP = "Minstens 12 tekens. Langer mag altijd.";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    setEmailError(false);
    setPasswordError(false);

    try {
      const outcome = await signUp(email, password);

      if (outcome === "invalid-email") {
        setEmailError(true);

        return;
      }

      if (outcome === "weak-password") {
        setPasswordError(true);

        return;
      }

      /*
       * `outcome === "accepted"` covers both a created account and an
       * address already registered — see `decideSignUp` — and this screen
       * must not tell them apart either. It lands on sign-in with a neutral
       * notice, **not signed in**: auto-signing-in here would answer the
       * taken-address branch with a session and the fresh one without,
       * which is the one-request oracle the shared decision exists to
       * close.
       */
      router.replace({
        params: { notice: "registered" },
        pathname: "/sign-in",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-lg bg-background p-lg">
      <Text size="xl" variant="heading">
        Registreren
      </Text>

      <Input
        autoCapitalize="none"
        autoComplete="email"
        errorMessage={emailError ? EMAIL_ERROR : undefined}
        invalid={emailError}
        keyboardType="email-address"
        label="E-mailadres"
        onChangeText={setEmail}
        testID="email"
        value={email}
      />
      <Input
        autoComplete="new-password"
        errorMessage={passwordError ? PASSWORD_ERROR : PASSWORD_HELP}
        invalid={passwordError}
        label="Wachtwoord"
        onChangeText={setPassword}
        secureTextEntry
        testID="password"
        value={password}
      />

      <Button loading={submitting} onPress={onSubmit} testID="submit">
        Account aanmaken
      </Button>

      <View className="flex-row gap-xs">
        <Text variant="muted">Heb je al een account?</Text>
        <Link href="/sign-in">
          <Text>Aanmelden</Text>
        </Link>
      </View>
    </View>
  );
}
