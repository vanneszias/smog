import {
  type Account,
  canUnlink,
  type SignInMethodsActions,
  useChangePasswordForm,
  useProfileForm,
  useSignInMethods,
} from "@smog/account/client";
import { PROFILE_NAME_MAX } from "@smog/account/schema";
import type { AppContract } from "@smog/api/client";
import { PASSWORD_MIN_LENGTH, type SocialProvider } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useRpcQuery } from "@smog/rpc/react";
import {
  AlertDialog,
  Badge,
  Button,
  Field,
  Heading,
  Input,
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
import { useActionToast, useShowFeedback } from "./use-action-toast";

/** Where a linked provider returns to (Expo turns it into `smog://`). */
const ACCOUNT_PATH = "/settings/account";

type Methods = NonNullable<Account["me"]>["methods"];

/** A titled group of the account screen. */
export function Section({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string | undefined;
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
  description?: string | undefined;
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

/**
 * Name (editable) and email (read-only). The language is under
 * Preferences: signed in, it is also the language of our emails.
 */
export function ProfileSection({
  account,
}: {
  account: Account;
}): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const form = useProfileForm(account);
  const { save } = form;
  const submit = useCallback(async (): Promise<void> => {
    if (await save()) {
      toast({ title: t("account.profile.saved"), variant: "success" });
    } else if (form.name.trim()) {
      toast({ title: t("auth.errors.generic"), variant: "danger" });
    }
  }, [form.name, save, t, toast]);

  return (
    <Section title={t("account.profile.title")}>
      <Field error={form.error} label={t("account.profile.name")}>
        <Input
          autoComplete="name"
          maxLength={PROFILE_NAME_MAX}
          onChangeText={form.setName}
          onSubmitEditing={submit}
          value={form.name}
        />
      </Field>
      <Button
        disabled={!form.dirty}
        loading={form.saving}
        onPress={submit}
        variant="secondary"
      >
        {t("common.save")}
      </Button>
      <Field
        hint={t("account.profile.emailHint")}
        label={t("account.profile.email")}
      >
        <Input editable={false} value={account.me?.email ?? ""} />
      </Field>
    </Section>
  );
}

function PasswordForm({
  actions,
  onDone,
}: {
  actions: SignInMethodsActions;
  onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const form = useChangePasswordForm(actions);
  const show = useShowFeedback();
  const { submit } = form;
  const onSubmit = useCallback(async (): Promise<void> => {
    const feedback = await submit();
    if (feedback) {
      show(feedback);
      if (feedback.variant === "success") {
        onDone();
      }
    }
  }, [onDone, show, submit]);

  return (
    <View className="gap-3">
      <Field
        error={form.errorFor("current")}
        label={t("account.methods.currentPassword")}
      >
        <Input
          autoComplete="current-password"
          onChangeText={form.setCurrent}
          secureTextEntry
          value={form.values.current}
        />
      </Field>
      <Field
        error={form.errorFor("next")}
        hint={t("auth.password.ruleMinLength", { min: PASSWORD_MIN_LENGTH })}
        label={t("auth.password.newLabel")}
      >
        <Input
          autoComplete="new-password"
          onChangeText={form.setNext}
          secureTextEntry
          value={form.values.next}
        />
      </Field>
      <Field
        error={form.errorFor("confirm")}
        label={t("auth.password.confirmLabel")}
      >
        <Input
          autoComplete="new-password"
          onChangeText={form.setConfirm}
          secureTextEntry
          value={form.values.confirm}
        />
      </Field>
      <Button loading={form.pending} onPress={onSubmit}>
        {t("common.save")}
      </Button>
    </View>
  );
}

function PasswordRow({
  actions,
  methods,
}: {
  actions: SignInMethodsActions;
  methods: Methods;
}): ReactElement {
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
      {methods.password && open ? (
        <PasswordForm actions={actions} onDone={close} />
      ) : null}
    </Row>
  );
}

function ProviderRow({
  actions,
  methods,
  provider,
}: {
  actions: SignInMethodsActions;
  methods: Methods;
  provider: SocialProvider;
}): ReactElement {
  const { t } = useTranslation();
  const report = useActionToast();
  const { toast } = useToast();
  const { link, pending, unlink } = actions;
  const label = t(`account.methods.${provider}`);
  const linked = methods[provider];
  const removable = canUnlink(methods, provider);
  const busy = pending !== null && pending !== provider;
  // A closed browser also resolves without an error: only the profile
  // read after the link says whether it happened.
  const [awaiting, setAwaiting] = useState(false);
  useEffect(() => {
    if (!awaiting) {
      return;
    }
    setAwaiting(false);
    if (linked) {
      toast({
        title: t("account.methods.linkedToast", { provider: label }),
        variant: "success",
      });
    }
  }, [awaiting, label, linked, t, toast]);

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
    if (result.ok) {
      setAwaiting(true);
    } else {
      report(result, "");
    }
  }, [link, provider, report]);
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
              disabled={!removable || busy}
              loading={pending === provider}
              variant="secondary"
            >
              {t("account.methods.unlink")}
            </Button>
          </AlertDialog>
        ) : (
          <Button
            disabled={busy}
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
  const client = useAuthClient();
  // One instance for the section, so one method change runs at a time.
  const actions = useSignInMethods({ client });
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
      <PasswordRow actions={actions} methods={methods} />
      {providers.map((provider) => (
        <ProviderRow
          actions={actions}
          key={provider}
          methods={methods}
          provider={provider}
        />
      ))}
    </Section>
  );
}
