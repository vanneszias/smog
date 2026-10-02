import {
  type AuthErrorKey,
  authErrorKey,
  newPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Field, Input, Text } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { useAuthClient } from "@/lib/auth-client";
import { pageMeta } from "@/lib/head";
import { validateResetSearch } from "@/lib/redirect";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: ({ matches }) => pageMeta(matches, "auth.resetPassword.title"),
  validateSearch: validateResetSearch,
});

function field(event: FormEvent<HTMLFormElement>, name: string): string {
  const value = new FormData(event.currentTarget).get(name);
  return typeof value === "string" ? value : "";
}

/** The landing page of the reset link: choose a new password. */
function ResetPassword(): ReactNode {
  const { t } = useTranslation();
  const client = useAuthClient();
  const { error: linkError, token } = Route.useSearch();
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!token) {
        return;
      }
      const password = field(event, "password");
      const invalid = newPasswordError({
        confirm: field(event, "confirm"),
        password,
      });
      setError(invalid);
      if (invalid) {
        return;
      }
      setPending(true);
      try {
        const result = await client.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error) {
          setError(authErrorKey(result.error));
        } else {
          setDone(true);
        }
      } catch (failure) {
        console.error("[auth] Failed to reset the password:", failure);
        setError("generic");
      } finally {
        setPending(false);
      }
    },
    [client, token]
  );

  const backToSignIn = (
    <Button asChild variant={done ? "primary" : "secondary"}>
      <Link search={{}} to="/sign-in">
        {t("auth.forgotPassword.backToSignIn")}
      </Link>
    </Button>
  );

  if (linkError || !token) {
    return (
      <AuthCard title={t("auth.resetPassword.title")}>
        <Text role="alert" tone="danger">
          {t("auth.resetPassword.invalid")}
        </Text>
        <Button asChild>
          <Link search={{}} to="/forgot-password">
            {t("auth.forgotPassword.submit")}
          </Link>
        </Button>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t("auth.resetPassword.title")}>
        <Text role="status">{t("auth.resetPassword.success")}</Text>
        {backToSignIn}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.resetPassword.title")}>
      <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
        <Field
          hint={t("auth.password.ruleMinLength", { min: PASSWORD_MIN_LENGTH })}
          label={t("auth.password.newLabel")}
        >
          <Input autoComplete="new-password" name="password" type="password" />
        </Field>
        <Field label={t("auth.password.confirmLabel")}>
          <Input autoComplete="new-password" name="confirm" type="password" />
        </Field>
        {error ? (
          <Text role="alert" size="body-sm" tone="danger">
            {t(`auth.errors.${error}`, {
              max: PASSWORD_MAX_LENGTH,
              min: PASSWORD_MIN_LENGTH,
            })}
          </Text>
        ) : null}
        <Button loading={pending} type="submit">
          {t("auth.resetPassword.submit")}
        </Button>
        {backToSignIn}
      </form>
    </AuthCard>
  );
}
