import { markSignInStarted } from "@smog/analytics/react";
import type { AppContract } from "@smog/api/client";
import {
  type AuthErrorField,
  type AuthErrorKey,
  type AuthFlow,
  type AuthMethod,
  type AuthMode,
  authErrorField,
  createFlowActions,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  useAuthFlow,
  useAuthState,
} from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useRpcQuery } from "@smog/rpc/react";
import {
  Button,
  Field,
  Heading,
  Input,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Apple from "lucide-react-native/icons/apple";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import KeyRound from "lucide-react-native/icons/key-round";
import Mail from "lucide-react-native/icons/mail";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useAuthClient } from "@/lib/auth-client";
import { mobileEnv } from "@/lib/env";
import { appleSignInAvailable, signInWithApple } from "./apple";

type NativeMethod = Exclude<AuthMethod, "passkey" | "magicLink">;

const ICONS: Record<NativeMethod, ReactElement> = {
  apple: <Apple />,
  emailCode: <Mail />,
  google: <KeyRound />,
  password: <KeyRound />,
};

/** The message for an `auth.errors.*` key (the provider is not named). */
function useErrorMessage(error: AuthErrorKey | null): string | undefined {
  const { t } = useTranslation();
  if (!error) {
    return undefined;
  }
  return t(`auth.errors.${error === "socialFailed" ? "generic" : error}`, {
    max: PASSWORD_MAX_LENGTH,
    min: PASSWORD_MIN_LENGTH,
  });
}

/** The error's message when it belongs to `field` (for `Field error`). */
function useFieldError(
  error: AuthErrorKey | null,
  field: AuthErrorField
): string | undefined {
  const message = useErrorMessage(error);
  return authErrorField(error) === field ? message : undefined;
}

/** A polite status line ("we sent a new code"). */
function Notice({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text accessibilityLiveRegion="polite" size="body-sm" tone="success">
      {children}
    </Text>
  );
}

/** A step-level error (not about one input), announced as an alert. */
function ErrorText({ error }: { error: AuthErrorKey | null }): ReactNode {
  const message = useErrorMessage(authErrorField(error) ? null : error);
  return message ? (
    <Text accessibilityRole="alert" size="body-sm" tone="danger">
      {message}
    </Text>
  ) : null;
}

function EmailStep({ flow }: { flow: AuthFlow }): ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = useState(flow.state.email);
  const error = useFieldError(flow.state.error, "email");
  const { submitEmail } = flow;
  const submit = useCallback(() => {
    submitEmail(email);
  }, [email, submitEmail]);
  return (
    <View className="gap-4">
      <Field error={error} label={t("auth.email.label")}>
        <Input
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          onSubmitEditing={submit}
          placeholder={t("auth.email.placeholder")}
          returnKeyType="next"
          textContentType="emailAddress"
          value={email}
        />
      </Field>
      <ErrorText error={flow.state.error} />
      <Button loading={flow.state.pending === "email"} onPress={submit}>
        {flow.state.mode === "forgotPassword"
          ? t("auth.forgotPassword.submit")
          : t("auth.email.submit")}
      </Button>
    </View>
  );
}

function MethodButton({
  choose,
  label,
  method,
  pending,
}: {
  choose: AuthFlow["choose"];
  label: string;
  method: NativeMethod;
  pending: AuthFlow["state"]["pending"];
}): ReactElement {
  const press = useCallback(() => {
    // Counted as sign_in_completed once the session appears.
    markSignInStarted(method);
    choose(method);
  }, [choose, method]);
  return (
    <Button
      disabled={pending !== null && pending !== method}
      icon={ICONS[method]}
      loading={pending === method}
      onPress={press}
      variant={method === "password" ? "primary" : "secondary"}
    >
      {label}
    </Button>
  );
}

function MethodStep({
  flow,
  methods,
}: {
  flow: AuthFlow;
  methods: NativeMethod[];
}): ReactElement {
  const { t } = useTranslation();
  const labels: Record<NativeMethod, string> = {
    apple: t("auth.methods.apple"),
    emailCode: t("auth.methods.emailCode"),
    google: t("auth.methods.google"),
    password: t("auth.methods.password"),
  };
  return (
    <View className="gap-3">
      <Text weight="medium">{t("auth.methods.title")}</Text>
      {methods.map((method) => (
        <MethodButton
          choose={flow.choose}
          key={method}
          label={labels[method]}
          method={method}
          pending={flow.state.pending}
        />
      ))}
      <ErrorText error={flow.state.error} />
    </View>
  );
}

function BackButton({ flow }: { flow: AuthFlow }): ReactElement {
  const { t } = useTranslation();
  return (
    <Button icon={<ArrowLeft />} onPress={flow.back} variant="ghost">
      {t("auth.methods.more")}
    </Button>
  );
}

function PasswordStep({ flow }: { flow: AuthFlow }): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const signUp = flow.state.mode === "signUp";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const nameError = useFieldError(flow.state.error, "name");
  const passwordError = useFieldError(flow.state.error, "password");
  const confirmError = useFieldError(flow.state.error, "confirm");
  const { submitPassword } = flow;
  const submit = useCallback(() => {
    submitPassword({ confirm, name, password });
  }, [confirm, name, password, submitPassword]);
  const forgot = useCallback(() => router.push("/forgot-password"), [router]);
  return (
    <View className="gap-4">
      {signUp ? (
        <Field error={nameError} label={t("auth.name.label")}>
          <Input
            autoComplete="name"
            onChangeText={setName}
            placeholder={t("auth.name.placeholder")}
            textContentType="name"
            value={name}
          />
        </Field>
      ) : null}
      <Field
        error={passwordError}
        hint={
          signUp
            ? t("auth.password.ruleMinLength", { min: PASSWORD_MIN_LENGTH })
            : undefined
        }
        label={signUp ? t("auth.password.newLabel") : t("auth.password.label")}
      >
        <Input
          autoComplete={signUp ? "new-password" : "current-password"}
          onChangeText={setPassword}
          onSubmitEditing={signUp ? undefined : submit}
          secureTextEntry
          textContentType={signUp ? "newPassword" : "password"}
          value={password}
        />
      </Field>
      {signUp ? (
        <Field error={confirmError} label={t("auth.password.confirmLabel")}>
          <Input
            autoComplete="new-password"
            onChangeText={setConfirm}
            onSubmitEditing={submit}
            secureTextEntry
            textContentType="newPassword"
            value={confirm}
          />
        </Field>
      ) : (
        <TextLink className="self-start text-body-sm" onPress={forgot}>
          {t("auth.password.forgot")}
        </TextLink>
      )}
      <ErrorText error={flow.state.error} />
      <Button loading={flow.state.pending === "password"} onPress={submit}>
        {signUp ? t("auth.password.signUp") : t("auth.password.signIn")}
      </Button>
      <BackButton flow={flow} />
    </View>
  );
}

function CodeStep({ flow }: { flow: AuthFlow }): ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const codeError = useFieldError(flow.state.error, "code");
  const { submitCode } = flow;
  const submit = useCallback(() => {
    submitCode(code);
  }, [code, submitCode]);
  return (
    <View className="gap-4">
      <Field
        error={codeError}
        hint={t("auth.otp.description", {
          email: flow.state.email,
          length: OTP_LENGTH,
        })}
        label={t("auth.otp.label")}
      >
        <Input
          autoComplete="one-time-code"
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          onChangeText={setCode}
          onSubmitEditing={submit}
          size="lg"
          textContentType="oneTimeCode"
          value={code}
        />
      </Field>
      <ErrorText error={flow.state.error} />
      {flow.state.notice === "codeResent" ? (
        <Notice>{t("auth.otp.resent")}</Notice>
      ) : null}
      <Button loading={flow.state.pending === "emailCode"} onPress={submit}>
        {t("auth.otp.submit")}
      </Button>
      <Button
        loading={flow.state.pending === "resend"}
        onPress={flow.resend}
        variant="secondary"
      >
        {t("auth.otp.resend")}
      </Button>
      <BackButton flow={flow} />
    </View>
  );
}

function InboxStep({ flow }: { flow: AuthFlow }): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { email, notice, pending, step } = flow.state;
  const reset = step === "resetSent";
  const toSignIn = useCallback(() => router.replace("/sign-in"), [router]);
  return (
    <View className="gap-4">
      <Text>
        {reset
          ? t("auth.forgotPassword.sent", { email })
          : t("auth.verifyEmail.description", { email })}
      </Text>
      <Text size="body-sm" tone="muted">
        {t("auth.checkInbox.spamHint")}
      </Text>
      <ErrorText error={flow.state.error} />
      {notice ? <Notice>{t("auth.verifyEmail.resent")}</Notice> : null}
      {reset ? (
        <Button onPress={toSignIn} variant="secondary">
          {t("auth.forgotPassword.backToSignIn")}
        </Button>
      ) : (
        <Button
          loading={pending === "resend"}
          onPress={flow.resend}
          variant="secondary"
        >
          {t("auth.verifyEmail.resend")}
        </Button>
      )}
      <Button onPress={flow.changeEmail} variant="ghost">
        {t("auth.checkInbox.wrongEmail")}
      </Button>
    </View>
  );
}

function StepBody({
  flow,
  methods,
}: {
  flow: AuthFlow;
  methods: NativeMethod[];
}): ReactNode {
  switch (flow.state.step) {
    case "email":
      return <EmailStep flow={flow} />;
    case "method":
      return <MethodStep flow={flow} methods={methods} />;
    case "password":
      return <PasswordStep flow={flow} />;
    case "code":
      return <CodeStep flow={flow} />;
    case "done":
      return null;
    default:
      return <InboxStep flow={flow} />;
  }
}

function useTitle(flow: AuthFlow): string {
  const { t } = useTranslation();
  const { mode, step } = flow.state;
  if (mode === "forgotPassword") {
    return t("auth.forgotPassword.title");
  }
  switch (step) {
    case "code":
      return t("auth.otp.title");
    case "verifyEmailSent":
      return t("auth.verifyEmail.title");
    case "done":
      return t("auth.signingIn");
    default:
      return mode === "signUp" ? t("auth.signUpTitle") : t("auth.title");
  }
}

/** Where the emailed links land: the site (the browser signs in there). */
function siteURL(path: string): string {
  return new URL(path, mobileEnv().EXPO_PUBLIC_API_URL).toString();
}

function useAppleAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    appleSignInAvailable().then((value) => {
      if (active) {
        setAvailable(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}

/**
 * Sign in, sign up and forgot password (`useAuthFlow`, shared with the
 * site). Mobile differences: no passkeys (web only, DECISIONS), no magic
 * link and email links open the site (the app cannot take over a browser
 * session yet), Apple uses the native sheet, and no Turnstile widget.
 */
export function AuthScreen({ mode }: { mode: AuthMode }): ReactElement {
  const { t } = useTranslation();
  const client = useAuthClient();
  const auth = useAuthState();
  const router = useRouter();
  const { toast } = useToast();
  const rpc = useRpcQuery<AppContract>();
  const config = useQuery(rpc.system.authConfig.queryOptions());
  const apple = useAppleAvailable();

  const actions = useMemo(
    () =>
      createFlowActions(client, {
        callbackURL: "/",
        errorCallbackURL: "/",
        resetPasswordURL: siteURL("/reset-password"),
        social: { apple: () => signInWithApple(client) },
        socialErrorCallbackURL: "/",
        socialFlow: {
          hasSession: async () => Boolean((await client.getSession()).data),
          kind: "session",
        },
        verifyEmailURL: siteURL("/verify-email"),
      }),
    [client]
  );
  const flow = useAuthFlow({ actions, mode });

  const methods = useMemo((): NativeMethod[] => {
    const list: NativeMethod[] = ["password", "emailCode"];
    if (config.data?.google) {
      list.push("google");
    }
    if (apple && config.data?.apple) {
      list.push("apple");
    }
    return list;
  }, [apple, config.data]);

  const signedIn = auth.status === "signedIn" && mode !== "forgotPassword";
  const done = flow.state.step === "done";
  // Leave once: after this flow signed in, or when already signed in.
  const left = useRef<boolean>(false);
  const { refetch } = auth;
  useEffect(() => {
    if (left.current || !(done || signedIn)) {
      return;
    }
    left.current = true;
    if (done) {
      refetch();
      toast({ title: t("auth.signedIn"), variant: "success" });
    }
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace("/");
    }
  }, [done, refetch, router, signedIn, t, toast]);

  const switchMode = useCallback(
    () => router.replace(mode === "signIn" ? "/sign-up" : "/sign-in"),
    [mode, router]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerClassName="gap-6 px-4 py-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Heading level={1}>{useTitle(flow)}</Heading>
          {flow.state.step === "email" && mode === "signIn" ? (
            <Text tone="muted">{t("auth.subtitle")}</Text>
          ) : null}
          {mode === "forgotPassword" && flow.state.step === "email" ? (
            <Text tone="muted">{t("auth.forgotPassword.description")}</Text>
          ) : null}
        </View>
        {flow.state.step === "email" || flow.state.step === "done" ? null : (
          <View className="flex-row items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
            <Text className="flex-1" numberOfLines={1} size="body-sm">
              {flow.state.email}
            </Text>
            <Button onPress={flow.changeEmail} size="sm" variant="ghost">
              {t("auth.email.change")}
            </Button>
          </View>
        )}
        <StepBody flow={flow} methods={methods} />
        {flow.state.step === "email" && mode !== "forgotPassword" ? (
          <View className="items-center">
            <Text size="body-sm" tone="muted">
              {mode === "signIn" ? t("auth.noAccount") : t("auth.haveAccount")}
            </Text>
            <TextLink onPress={switchMode}>
              {mode === "signIn" ? t("auth.signUpLink") : t("nav.signIn")}
            </TextLink>
          </View>
        ) : null}
        {mode === "forgotPassword" ? null : (
          <Text className="text-center" size="caption" tone="muted">
            {t("auth.legal")}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
