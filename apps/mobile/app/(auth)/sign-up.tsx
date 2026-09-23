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

/**
 * The device is offline, or the request fails for any other reason `signUp`
 * doesn't turn into `"invalid-email"` / `"weak-password"` (see `session.ts`'s
 * `ApiError("unknown", …)` fallback).
 * Same wording pattern as `sign-in.tsx`'s `SIGN_IN_ERROR` and
 * `forgot-password.tsx`'s `NETWORK_ERROR` — a network failure says nothing
 * about whether the address is registered, so it is safe to be plain about.
 */
const SIGN_UP_ERROR =
  "Registreren is niet gelukt. Controleer je internetverbinding en probeer het opnieuw.";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    setEmailError(false);
    setPasswordError(false);
    setFailed(false);

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
    } catch {
      // A network failure, or any status `signUp` doesn't recognise — see
      // `SIGN_UP_ERROR` above. Without this, the `finally` below still
      // resets `submitting` and the screen does nothing else: a silent
      // no-op indistinguishable from a rejected address.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-lg bg-background p-lg">
      <Text size="xl" variant="heading">
        Registreren
      </Text>

      {failed ? (
        <Text className="text-danger" testID="sign-up-error">
          {SIGN_UP_ERROR}
        </Text>
      ) : null}

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
