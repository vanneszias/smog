import {
  type Account,
  canUnlink,
  useSignInMethods,
} from "@smog/account/client";
import { PROFILE_NAME_MAX } from "@smog/account/schema";
import type { AppContract } from "@smog/api/client";
import {
  newPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type SocialProvider,
} from "@smog/auth/react";
import { isLocale, LOCALES } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useRpcQuery } from "@smog/rpc/react";
import {
  AlertDialog,
  Badge,
  Button,
  Field,
  Heading,
  Input,
  Select,
  Text,
  useToast,
} from "@smog/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { View } from "react-native";
import { appleIdentityToken, useAppleSignInAvailable } from "@/auth/apple";
import { useAuthClient } from "@/lib/auth-client";
import { useActionErrorMessage, useActionToast } from "./use-action-toast";

/** Where a linked provider returns to (Expo turns it into `smog://`). */
const ACCOUNT_PATH = "/settings/account";
/** The email language picker's "follow the app" value (`locale: null`). */
const AUTO = "auto";

type Methods = NonNullable<Account["me"]>["methods"];

/** A titled group of the account screen. */
export function Section({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}): ReactElement {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Heading level={2}>{title}</Heading>
        {description ? (
          <Text size="body-sm" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One method: its name and state, then its action. */
function Row({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  description?: string;
  title: ReactNode;
}): ReactElement {
  return (
    <View className="gap-2 rounded-lg border border-border-subtle bg-surface p-4">
      <View className="flex-row flex-wrap items-center gap-2">{title}</View>
      {description ? (
        <Text size="body-sm" tone="muted">
          {description}
        </Text>
      ) : null}
      {children}
      {action}
    </View>
  );
}

export function ProfileSection({
  account,
}: {
  account: Account;
}): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { me, updateProfile } = account;
  const saved = me?.name ?? "";
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(saved);
  }, [saved]);

  const save = useCallback(async (): Promise<void> => {
    if (!name.trim()) {
      setError(t("auth.errors.nameRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name });
      toast({ title: t("account.profile.saved"), variant: "success" });
    } catch {
      // `useAccount` logged it.
      toast({ title: t("auth.errors.generic"), variant: "danger" });
    } finally {
      setSaving(false);
    }
  }, [name, t, toast, updateProfile]);

  const changeLocale = useCallback(
    async (value: string): Promise<void> => {
      try {
        await updateProfile({ locale: isLocale(value) ? value : null });
        toast({ title: t("account.profile.saved"), variant: "success" });
      } catch {
        toast({ title: t("auth.errors.generic"), variant: "danger" });
      }
    },
    [t, toast, updateProfile]
  );

  return (
    <Section title={t("account.profile.title")}>
      <Field error={error} label={t("account.profile.name")}>
        <Input
          autoComplete="name"
          maxLength={PROFILE_NAME_MAX}
          onChangeText={setName}
          onSubmitEditing={save}
          value={name}
        />
      </Field>
      <Button
        disabled={name.trim() === saved}
        loading={saving}
        onPress={save}
        variant="secondary"
      >
        {t("common.save")}
      </Button>
      <Field
        hint={t("account.profile.emailHint")}
        label={t("account.profile.email")}
      >
        <Input editable={false} value={me?.email ?? ""} />
      </Field>
      <Field
        hint={t("account.profile.languageHint")}
        label={t("account.profile.language")}
      >
        <Select
          onValueChange={changeLocale}
          options={[
            { label: t("account.profile.languageAuto"), value: AUTO },
            ...LOCALES.map((locale) => ({
              label: t(`language.${locale}`),
              value: locale,
            })),
          ]}
          value={me?.locale ?? AUTO}
        />
      </Field>
    </Section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }): ReactElement {
  const { t } = useTranslation();
  const client = useAuthClient();
  const { changePassword, pending } = useSignInMethods({ client });
  const message = useActionErrorMessage();
  const report = useActionToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<{
    field: "current" | "next" | "confirm";
    text: string;
  } | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    if (!current) {
      setError({ field: "current", text: t("auth.errors.passwordRequired") });
      return;
    }
    const invalid = newPasswordError({ confirm, password: next });
    if (invalid) {
      setError({
        field: invalid === "passwordMismatch" ? "confirm" : "next",
        text: t(`auth.errors.${invalid}`, {
          max: PASSWORD_MAX_LENGTH,
          min: PASSWORD_MIN_LENGTH,
        }),
      });
      return;
    }
    setError(null);
    const result = await changePassword({
      currentPassword: current,
      newPassword: next,
    });
    if (result.ok) {
      report(result, t("account.methods.passwordChanged"));
      onDone();
    } else if (result.error === "INVALID_PASSWORD") {
      setError({ field: "current", text: message(result.error) });
    } else if (result.error.startsWith("PASSWORD_TOO")) {
      setError({ field: "next", text: message(result.error) });
    } else {
      report(result, "");
    }
  }, [changePassword, confirm, current, message, next, onDone, report, t]);

  const errorFor = (field: "current" | "next" | "confirm") =>
    error?.field === field ? error.text : undefined;
  return (
    <View className="gap-3">
      <Field
        error={errorFor("current")}
        label={t("account.methods.currentPassword")}
      >
        <Input
          autoComplete="current-password"
          onChangeText={setCurrent}
          secureTextEntry
          value={current}
        />
      </Field>
      <Field
        error={errorFor("next")}
        hint={t("auth.password.ruleMinLength", { min: PASSWORD_MIN_LENGTH })}
        label={t("auth.password.newLabel")}
      >
        <Input
          autoComplete="new-password"
          onChangeText={setNext}
          secureTextEntry
          value={next}
        />
      </Field>
      <Field
        error={errorFor("confirm")}
        label={t("auth.password.confirmLabel")}
      >
        <Input
          autoComplete="new-password"
          onChangeText={setConfirm}
          secureTextEntry
          value={confirm}
        />
      </Field>
      <Button loading={pending === "password"} onPress={submit}>
        {t("common.save")}
      </Button>
    </View>
  );
}

function PasswordRow({ methods }: { methods: Methods }): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);
  const setPassword = useCallback(
    () => router.push("/forgot-password"),
    [router]
  );
  return (
    <Row
      action={
        methods.password ? (
          <Button onPress={toggle} variant={open ? "ghost" : "secondary"}>
            {open ? t("common.cancel") : t("account.methods.changePassword")}
          </Button>
        ) : (
          <Button onPress={setPassword} variant="secondary">
            {t("account.methods.setPassword")}
          </Button>
        )
      }
      description={
        methods.password
          ? t("account.methods.passwordSet")
          : `${t("account.methods.passwordNone")} ${t("account.methods.setPasswordHint")}`
      }
      title={<Text weight="medium">{t("account.methods.password")}</Text>}
    >
      {methods.password && open ? <PasswordForm onDone={close} /> : null}
    </Row>
  );
}

function ProviderRow({
  methods,
  provider,
}: {
  methods: Methods;
  provider: SocialProvider;
}): ReactElement {
  const { t } = useTranslation();
  const client = useAuthClient();
  const { link, pending, unlink } = useSignInMethods({ client });
  const report = useActionToast();
  const label = t(`account.methods.${provider}`);
  const linked = methods[provider];
  const removable = canUnlink(methods, provider);

  const startLink = useCallback(async () => {
    // Apple on iOS: the native sheet's token, no browser.
    const token = provider === "apple" ? await appleIdentityToken() : null;
    if (provider === "apple" && !token) {
      return;
    }
    const result = await link(provider, {
      callbackURL: ACCOUNT_PATH,
      ...(token ? { idToken: { token } } : {}),
    });
    report(result, t("account.methods.linkedToast", { provider: label }));
  }, [label, link, provider, report, t]);
  const confirmUnlink = useCallback(async () => {
    report(
      await unlink(provider),
      t("account.methods.unlinked", { provider: label })
    );
  }, [label, provider, report, t, unlink]);

  return (
    <Row
      action={
        linked ? (
          <AlertDialog
            confirmLabel={t("account.methods.unlink")}
            description={t("account.methods.unlinkDescription", {
              provider: label,
            })}
            onConfirm={confirmUnlink}
            title={t("account.methods.unlinkTitle", { provider: label })}
            tone="danger"
          >
            <Button
              disabled={!removable}
              loading={pending === provider}
              variant="secondary"
            >
              {t("account.methods.unlink")}
            </Button>
          </AlertDialog>
        ) : (
          <Button
            loading={pending === provider}
            onPress={startLink}
            variant="secondary"
          >
            {t("account.methods.link")}
          </Button>
        )
      }
      description={
        linked && !removable ? t("account.methods.lastMethod") : undefined
      }
      title={
        <>
          <Text weight="medium">{label}</Text>
          <Badge variant={linked ? "success" : "neutral"}>
            {linked
              ? t("account.methods.linked")
              : t("account.methods.notLinked")}
          </Badge>
        </>
      }
    />
  );
}

/**
 * Password, Google and Apple. Passkeys are web-only for now (DECISIONS,
 * D-PASSKEY): the app says nothing about them.
 */
export function SignInMethodsSection({
  account,
}: {
  account: Account;
}): ReactElement | null {
  const { t } = useTranslation();
  const rpc = useRpcQuery<AppContract>();
  const config = useQuery(rpc.system.authConfig.queryOptions());
  const apple = useAppleSignInAvailable();
  const methods = account.me?.methods;
  if (!methods) {
    return null;
  }
  const providers = (["google", "apple"] as const).filter((provider) => {
    const offered =
      config.data?.[provider] === true && (provider !== "apple" || apple);
    // A linked provider stays visible, so it can be unlinked.
    return offered || methods[provider];
  });
  return (
    <Section
      description={t("account.methods.description")}
      title={t("account.methods.title")}
    >
      <PasswordRow methods={methods} />
      {providers.map((provider) => (
        <ProviderRow key={provider} methods={methods} provider={provider} />
      ))}
    </Section>
  );
}
