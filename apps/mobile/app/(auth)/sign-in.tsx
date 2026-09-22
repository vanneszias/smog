import { Button, Card, Input, Text } from "@smog/ui-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { signInWithGoogle } from "@/lib/google";
import { signIn, useSession } from "@/lib/session";

/**
 * **One sentence for every refusal**, shown after any failed attempt —
 * unknown address, wrong password, or a locked account with either
 * password. `endpoints/auth.ts`'s `usersLogin` (which this screen's
 * `signIn` calls) already answers all of those with the same bytes; this is
 * the same wording the web sign-in page carries, and for the same reason:
 * true for the visitor who really is locked out, harmless for the one who
 * mistyped, and worth nothing to an enumerator, because it is shown on
 * every failure whether or not the address is registered.
 */
const SIGN_IN_ERROR =
  "E-mailadres of wachtwoord klopt niet. Na vijf mislukte pogingen wordt aanmelden voor dit account tien minuten geblokkeerd — probeer het dan later opnieuw.";

/**
 * Sign-up never signs anyone in — see `sign-up.tsx` and `decideSignUp`'s own
 * comment in `endpoints/auth.ts` — so it lands here with this notice
 * instead. "If that address was still free" is the requirement, not
 * coyness: a screen that said "your account has been created" would give
 * away the one bit `decideSignUp` exists to hide.
 */
const REGISTERED_NOTICE =
  "Als dat e-mailadres nog vrij was, staat je account klaar. Meld je hieronder aan.";

/**
 * `signInWithGoogle` resolving is not itself proof of a session: a
 * cancelled flow (`WebBrowser`'s `dismiss`/`cancel`) resolves exactly the
 * same way, with nothing stored. So this screen does not navigate straight
 * off the `await` the way the password form does below — it watches
 * {@link useSession}'s `user` instead, which only turns truthy once
 * `signInWithGoogle` has actually stored a token, via the same
 * `notifySessionChanged` reactivity Task 8 built for exactly this: a screen
 * mounted before the session changes elsewhere still notices.
 */
const GOOGLE_ERROR =
  "Aanmelden met Google is niet gelukt. Probeer het opnieuw, of gebruik e-mailadres en wachtwoord.";

export default function SignInScreen() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { user } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (user !== null) {
      router.replace("/");
    }
  }, [user]);

  const onSubmit = async () => {
    setSubmitting(true);
    setFailed(false);

    try {
      await signIn(email, password);
      router.replace("/");
    } catch {
      // Every refusal renders the same way — see `SIGN_IN_ERROR` above.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogleSignIn = async () => {
    setGoogleSubmitting(true);
    setGoogleFailed(false);

    try {
      await signInWithGoogle();
      // A cancelled flow resolves here too — see `GOOGLE_ERROR`'s comment.
      // Navigation happens through the `useSession` effect above, once (and
      // only if) a token was actually stored.
    } catch {
      setGoogleFailed(true);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-lg bg-background p-lg">
      <Text size="xl" variant="heading">
        Aanmelden
      </Text>

      {notice === "registered" ? (
        <Card className="border-border p-md">
          <Text testID="sign-in-notice">{REGISTERED_NOTICE}</Text>
        </Card>
      ) : null}

      {failed ? (
        <Text className="text-danger" testID="sign-in-error">
          {SIGN_IN_ERROR}
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
      <Input
        autoComplete="current-password"
        label="Wachtwoord"
        onChangeText={setPassword}
        secureTextEntry
        testID="password"
        value={password}
      />

      <Button loading={submitting} onPress={onSubmit} testID="submit">
        Aanmelden
      </Button>

      {googleFailed ? (
        <Text className="text-danger" testID="google-error">
          {GOOGLE_ERROR}
        </Text>
      ) : null}

      <Button
        loading={googleSubmitting}
        onPress={onGoogleSignIn}
        testID="google-submit"
        variant="secondary"
      >
        Aanmelden met Google
      </Button>

      <Link href="/forgot-password">
        <Text variant="muted">Wachtwoord vergeten?</Text>
      </Link>

      <View className="flex-row gap-xs">
        <Text variant="muted">Nog geen account?</Text>
        <Link href="/sign-up">
          <Text>Registreren</Text>
        </Link>
      </View>
    </View>
  );
}
