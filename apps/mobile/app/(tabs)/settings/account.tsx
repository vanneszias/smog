import { Button, Card, EmptyState, Input, Text } from "@smog/ui-native";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError } from "@/lib/api";
import { t, useLocale } from "@/lib/i18n";
import {
  changePassword,
  deleteAccount,
  requestEmailChange,
  useSession,
} from "@/lib/session";

/**
 * The account screen — the one with the destructive action on it.
 *
 * **Delete does not fire on the first press.** Pressing
 * {@link DeleteAccountCard}'s "delete my account" button only reveals a
 * confirmation panel (`confirming` below); `deleteAccount` is called from
 * nowhere else. See `account.test.tsx`'s mutation proof for what happens to
 * that test the moment this stops being true.
 *
 * **`/account/delete` asks for the account's own address, not a
 * password.** `endpoints/account.ts`'s `decideDeleteAccount` compares a
 * typed address to the signed-in account's own — deliberately not a
 * password, since deletion cannot be used to take an account over the way a
 * password or address change can, and a password would lock out an account
 * that has none (a Google sign-in). The confirmation field below is
 * therefore an email field, not a password field.
 */

function AccountEmail({ email }: { email: string }) {
  return (
    <Card className="gap-xs p-md">
      <Text variant="heading">{t("account.accountInfo")}</Text>
      <Text testID="account-email">{email}</Text>
    </Card>
  );
}

type PasswordError = "credentials" | "password" | "network";

function passwordErrorMessage(error: PasswordError): string {
  if (error === "credentials") {
    return t("account.currentPasswordIncorrect");
  }

  if (error === "password") {
    return t("account.passwordWeak");
  }

  return t("account.networkError");
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<PasswordError | null>(null);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const outcome = await changePassword(current, next);

      if (outcome === "changed") {
        router.replace({
          params: { notice: "password-changed" },
          pathname: "/(auth)/sign-in",
        });
        return;
      }

      setError(outcome);
    } catch {
      // A network failure, or a status this screen has no specific message
      // for. Without this `catch`, `submitting` still clears in `finally`
      // and the screen does nothing else — indistinguishable from a slow
      // success on the one screen where that distinction matters most.
      setError("network");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="gap-sm p-md">
      <Text variant="heading">{t("account.changePassword")}</Text>

      <Input
        autoComplete="current-password"
        label={t("account.currentPasswordLabel")}
        onChangeText={setCurrent}
        secureTextEntry
        testID="current-password"
        value={current}
      />
      <Input
        autoComplete="new-password"
        label={t("account.newPasswordLabel")}
        onChangeText={setNext}
        secureTextEntry
        testID="new-password"
        value={next}
      />

      {error === null ? null : (
        <Text className="text-danger" testID="password-error">
          {passwordErrorMessage(error)}
        </Text>
      )}

      <Button
        disabled={current === "" || next === ""}
        loading={submitting}
        onPress={onSubmit}
        testID="submit-password"
      >
        {t("account.changePassword")}
      </Button>
    </Card>
  );
}

type EmailError = "credentials" | "email" | "email-unchanged" | "network";

function emailErrorMessage(error: EmailError): string {
  if (error === "credentials") {
    return t("account.currentPasswordIncorrect");
  }

  if (error === "email") {
    return t("account.emailInvalid");
  }

  if (error === "email-unchanged") {
    return t("account.emailUnchanged");
  }

  return t("account.networkError");
}

function ChangeEmailCard() {
  const { locale } = useLocale();
  const [current, setCurrent] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<EmailError | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setPending(false);

    try {
      const outcome = await requestEmailChange(current, email, locale);

      if (outcome === "pending") {
        setPending(true);
        setCurrent("");
        setEmail("");
        return;
      }

      setError(outcome);
    } catch {
      setError("network");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="gap-sm p-md">
      <Text variant="heading">{t("account.changeEmail")}</Text>

      {pending ? (
        <Text testID="email-pending">{t("account.emailChangePending")}</Text>
      ) : null}

      <Input
        autoComplete="current-password"
        label={t("account.currentPasswordLabel")}
        onChangeText={setCurrent}
        secureTextEntry
        testID="email-current-password"
        value={current}
      />
      <Input
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label={t("account.newEmailLabel")}
        onChangeText={setEmail}
        testID="new-email"
        value={email}
      />

      {error === null ? null : (
        <Text className="text-danger" testID="email-error">
          {emailErrorMessage(error)}
        </Text>
      )}

      <Button
        disabled={current === "" || email === ""}
        loading={submitting}
        onPress={onSubmit}
        testID="submit-email"
      >
        {t("account.changeEmail")}
      </Button>
    </Card>
  );
}

function DeleteAccountCard({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setDeleting(true);
    setError(null);

    try {
      await deleteAccount(confirmEmail);
      router.replace({
        params: { notice: "deleted" },
        pathname: "/(auth)/sign-in",
      });
    } catch (thrown) {
      // A refused confirmation, or a network failure — either way the
      // account is untouched (`deleteAccount` only clears the local session
      // once the server actually agreed), so this screen has to say so
      // rather than leaving `deleting` to clear silently.
      if (thrown instanceof ApiError && thrown.code === "confirm") {
        setError(t("account.deleteMismatch"));
      } else if (thrown instanceof ApiError && thrown.code === "delete") {
        setError(t("account.deleteFailed"));
      } else {
        setError(t("account.networkError"));
      }
    } finally {
      setDeleting(false);
    }
  };

  const onCancel = () => {
    setConfirming(false);
    setConfirmEmail("");
    setError(null);
  };

  const confirmDisabled =
    confirmEmail.trim().toLowerCase() !== email.toLowerCase();

  return (
    <Card className="gap-sm border-danger p-md">
      <Text variant="heading">{t("account.deleteAccount")}</Text>

      {confirming ? (
        <View className="gap-sm">
          <Input
            autoCapitalize="none"
            keyboardType="email-address"
            label={t("account.confirmEmailLabel")}
            onChangeText={setConfirmEmail}
            testID="confirm-email"
            value={confirmEmail}
          />

          {error === null ? null : (
            <Text className="text-danger" testID="delete-error">
              {error}
            </Text>
          )}

          <View className="flex-row gap-sm">
            <Button
              disabled={deleting}
              onPress={onCancel}
              testID="cancel-delete"
              variant="secondary"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={confirmDisabled}
              loading={deleting}
              onPress={onConfirm}
              testID="confirm-delete"
              variant="danger"
            >
              {t("common.confirm")}
            </Button>
          </View>
        </View>
      ) : (
        <Button
          onPress={() => setConfirming(true)}
          testID="delete-account"
          variant="danger"
        >
          {t("account.deleteAccount")}
        </Button>
      )}
    </Card>
  );
}

export default function AccountScreen() {
  const { loading, user } = useSession();

  if (loading) {
    return null;
  }

  if (user === null) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-background p-lg">
        <EmptyState
          action={
            <Button
              onPress={() => router.push("/(auth)/sign-in")}
              testID="go-to-sign-in"
            >
              {t("auth.signIn.button")}
            </Button>
          }
          description={t("account.signInRequired")}
          testID="account-signed-out"
          title={t("account.title")}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <Text size="xl" variant="heading">
        {t("account.title")}
      </Text>

      <AccountEmail email={user.email} />
      <ChangePasswordCard />
      <ChangeEmailCard />
      <DeleteAccountCard email={user.email} />
    </View>
  );
}
