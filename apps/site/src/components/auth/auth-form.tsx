import { useMarkSignInStarted } from "@smog/analytics/react";
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
import {
  Button,
  Field,
  IconButton,
  Input,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-web";
import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import {
  Apple,
  ArrowLeft,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Link2,
  Mail,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthClient } from "@/lib/auth-client";
import { usePasskeySupport } from "@/lib/passkeys";
import { withRedirect } from "@/lib/redirect";
import { AuthCard } from "./auth-card";
import { Turnstile } from "./turnstile";

const rootApi = getRouteApi("__root__");

/** Lucide has no brand marks for Google; a neutral key stands in. */
const METHOD_ICONS: Record<AuthMethod, ReactNode> = {
  apple: <Apple />,
  emailCode: <Mail />,
  google: <KeyRound />,
  magicLink: <Link2 />,
  passkey: <Fingerprint />,
  password: <KeyRound />,
};

type FormValues = (name: string) => string;

/** A stable submit handler that reads the form's fields by name. */
function useSubmit(
  handler: (values: FormValues) => void
): (event: FormEvent<HTMLFormElement>) => void {
  return useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      handler((name) => {
        const value = data.get(name);
        return typeof value === "string" ? value : "";
      });
    },
    [handler]
  );
}

/** The message for an `auth.errors.*` key. */
function useErrorMessage(error: AuthErrorKey | null): string | undefined {
  const { t } = useTranslation();
  if (!error) {
    return undefined;
  }
  // The provider is not known after a redirect: say it generically.
  const key = error === "socialFailed" ? "generic" : error;
  return t(`auth.errors.${key}`, {
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

/** A step-level error (not about one input), announced as an alert. */
function ErrorText({ error }: { error: AuthErrorKey | null }): ReactNode {
  const message = useErrorMessage(authErrorField(error) ? null : error);
  return message ? (
    <Text role="alert" size="body-sm" tone="danger">
      {message}
    </Text>
  ) : null;
}

function PasswordInput({
  autoComplete,
  name,
}: {
  autoComplete: "current-password" | "new-password";
  name: string;
}): ReactNode {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible((value) => !value), []);
  return (
    <Input
      autoComplete={autoComplete}
      name={name}
      trailing={
        <IconButton
          icon={visible ? <EyeOff /> : <Eye />}
          label={t(visible ? "a11y.hidePassword" : "a11y.showPassword")}
          onClick={toggle}
        />
      }
      type={visible ? "text" : "password"}
    />
  );
}

function BackButton({ flow }: { flow: AuthFlow }): ReactNode {
  const { t } = useTranslation();
  return (
    <Button icon={<ArrowLeft />} onClick={flow.back} variant="ghost">
      {t("auth.methods.more")}
    </Button>
  );
}

function EmailStep({ flow }: { flow: AuthFlow }): ReactNode {
  const { t } = useTranslation();
  const { state } = flow;
  const error = useFieldError(state.error, "email");
  const { submitEmail } = flow;
  const onSubmit = useSubmit(
    useCallback(
      (values: FormValues) => submitEmail(values("email")),
      [submitEmail]
    )
  );
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
      <Field error={error} label={t("auth.email.label")}>
        <Input
          autoComplete="email"
          defaultValue={state.email}
          inputMode="email"
          name="email"
          placeholder={t("auth.email.placeholder")}
          type="email"
        />
      </Field>
      <ErrorText error={state.error} />
      <Button loading={state.pending === "email"} type="submit">
        {state.mode === "forgotPassword"
          ? t("auth.forgotPassword.submit")
          : t("auth.email.submit")}
      </Button>
    </form>
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
  method: AuthMethod;
  pending: AuthFlow["state"]["pending"];
}): ReactNode {
  const markSignIn = useMarkSignInStarted();
  const onClick = useCallback(() => {
    // Counted as sign_in_completed once the session appears.
    markSignIn(method);
    choose(method);
  }, [choose, markSignIn, method]);
  return (
    <Button
      disabled={pending !== null && pending !== method}
      icon={METHOD_ICONS[method]}
      loading={pending === method}
      onClick={onClick}
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
  methods: AuthMethod[];
}): ReactNode {
  const { t } = useTranslation();
  const { state } = flow;
  const labels: Record<AuthMethod, string> = {
    apple: t("auth.methods.apple"),
    emailCode: t("auth.methods.emailCode"),
    google: t("auth.methods.google"),
    magicLink: t("auth.methods.magicLink"),
    passkey: t("auth.methods.passkey"),
    password: t("auth.methods.password"),
  };
  return (
    <div className="flex flex-col gap-3">
      <Text weight="medium">{t("auth.methods.title")}</Text>
      {methods.map((method) => (
        <MethodButton
          choose={flow.choose}
          key={method}
          label={labels[method]}
          method={method}
          pending={state.pending}
        />
      ))}
      <ErrorText error={state.error} />
    </div>
  );
}

function PasswordStep({
  flow,
  redirect,
}: {
  flow: AuthFlow;
  redirect: string;
}): ReactNode {
  const { t } = useTranslation();
  const { state } = flow;
  const nameError = useFieldError(state.error, "name");
  const passwordError = useFieldError(state.error, "password");
  const confirmError = useFieldError(state.error, "confirm");
  const signUp = state.mode === "signUp";
  const { submitPassword } = flow;
  const onSubmit = useSubmit(
    useCallback(
      (values: FormValues) =>
        submitPassword({
          confirm: values("confirm"),
          name: values("name"),
          password: values("password"),
        }),
      [submitPassword]
    )
  );
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
      {signUp ? (
        <Field error={nameError} label={t("auth.name.label")}>
          <Input
            autoComplete="name"
            name="name"
            placeholder={t("auth.name.placeholder")}
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
        <PasswordInput
          autoComplete={signUp ? "new-password" : "current-password"}
          name="password"
        />
      </Field>
      {signUp ? (
        <Field error={confirmError} label={t("auth.password.confirmLabel")}>
          <PasswordInput autoComplete="new-password" name="confirm" />
        </Field>
      ) : (
        <TextLink asChild className="self-start text-body-sm">
          <Link
            search={redirect === "/" ? {} : { redirect }}
            to="/forgot-password"
          >
            {t("auth.password.forgot")}
          </Link>
        </TextLink>
      )}
      <ErrorText error={state.error} />
      <Button loading={state.pending === "password"} type="submit">
        {signUp ? t("auth.password.signUp") : t("auth.password.signIn")}
      </Button>
      <BackButton flow={flow} />
    </form>
  );
}

function CodeStep({ flow }: { flow: AuthFlow }): ReactNode {
  const { t } = useTranslation();
  const { state, submitCode } = flow;
  const codeError = useFieldError(state.error, "code");
  const onSubmit = useSubmit(
    useCallback(
      (values: FormValues) => submitCode(values("code")),
      [submitCode]
    )
  );
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
      <Field
        error={codeError}
        hint={t("auth.otp.description", {
          email: state.email,
          length: OTP_LENGTH,
        })}
        label={t("auth.otp.label")}
      >
        <Input
          autoComplete="one-time-code"
          className="tracking-widest"
          inputMode="numeric"
          maxLength={OTP_LENGTH + 2}
          name="code"
          pattern="[0-9 ]*"
          size="lg"
        />
      </Field>
      <ErrorText error={state.error} />
      {state.notice === "codeResent" ? (
        <Text role="status" size="body-sm" tone="success">
          {t("auth.otp.resent")}
        </Text>
      ) : null}
      <Button loading={state.pending === "emailCode"} type="submit">
        {t("auth.otp.submit")}
      </Button>
      <Button
        loading={state.pending === "resend"}
        onClick={flow.resend}
        variant="secondary"
      >
        {t("auth.otp.resend")}
      </Button>
      <BackButton flow={flow} />
    </form>
  );
}

function InboxStep({ flow }: { flow: AuthFlow }): ReactNode {
  const { t } = useTranslation();
  const { state } = flow;
  const copy = {
    magicLinkSent: {
      description: t("auth.magicLink.description", { email: state.email }),
      resend: t("auth.magicLink.resend"),
      resent: t("auth.magicLink.resent"),
    },
    resetSent: {
      description: t("auth.forgotPassword.sent", { email: state.email }),
      resend: null,
      resent: null,
    },
    verifyEmailSent: {
      description: t("auth.verifyEmail.description", { email: state.email }),
      resend: t("auth.verifyEmail.resend"),
      resent: t("auth.verifyEmail.resent"),
    },
  }[state.step as "magicLinkSent" | "resetSent" | "verifyEmailSent"];
  return (
    <div className="flex flex-col gap-4">
      <Text>{copy.description}</Text>
      <Text size="body-sm" tone="muted">
        {t("auth.checkInbox.spamHint")}
      </Text>
      <ErrorText error={state.error} />
      {state.notice && copy.resent ? (
        <Text role="status" size="body-sm" tone="success">
          {copy.resent}
        </Text>
      ) : null}
      {copy.resend ? (
        <Button
          loading={state.pending === "resend"}
          onClick={flow.resend}
          variant="secondary"
        >
          {copy.resend}
        </Button>
      ) : null}
      {state.step === "resetSent" ? (
        <Button asChild variant="ghost">
          <Link search={{}} to="/sign-in">
            {t("auth.forgotPassword.backToSignIn")}
          </Link>
        </Button>
      ) : (
        <Button onClick={flow.changeEmail} variant="ghost">
          {t("auth.checkInbox.wrongEmail")}
        </Button>
      )}
    </div>
  );
}

function StepBody({
  flow,
  methods,
  redirect,
}: {
  flow: AuthFlow;
  methods: AuthMethod[];
  redirect: string;
}): ReactNode {
  switch (flow.state.step) {
    case "email":
      return <EmailStep flow={flow} />;
    case "method":
      return <MethodStep flow={flow} methods={methods} />;
    case "password":
      return <PasswordStep flow={flow} redirect={redirect} />;
    case "code":
      return <CodeStep flow={flow} />;
    case "done":
      return null;
    default:
      return <InboxStep flow={flow} />;
  }
}

function useTitle(flow: AuthFlow): { description?: string; title: string } {
  const { t } = useTranslation();
  const { mode, step } = flow.state;
  if (mode === "forgotPassword") {
    return {
      description:
        step === "email" ? t("auth.forgotPassword.description") : undefined,
      title: t("auth.forgotPassword.title"),
    };
  }
  switch (step) {
    case "code":
      return { title: t("auth.otp.title") };
    case "magicLinkSent":
      return { title: t("auth.magicLink.title") };
    case "verifyEmailSent":
      return { title: t("auth.verifyEmail.title") };
    case "done":
      return { title: t("auth.signingIn") };
    default:
      return mode === "signUp"
        ? { title: t("auth.signUpTitle") }
        : { description: t("auth.subtitle"), title: t("auth.title") };
  }
}

export interface AuthFormProps {
  /** A `?error=` from a failed social sign-in redirect. */
  error?: string | undefined;
  mode: AuthMode;
  /** Where to go once signed in (a safe same-site path). */
  redirect: string;
}

/**
 * Sign in, sign up and forgot password on one component: email first,
 * then the method choice (`useAuthFlow` from `@smog/auth/react`).
 */
export function AuthForm({ error, mode, redirect }: AuthFormProps): ReactNode {
  const { t } = useTranslation();
  const client = useAuthClient();
  const router = useRouter();
  const auth = useAuthState();
  const { toast } = useToast();
  const { auth: config } = rootApi.useLoaderData();
  const passkeys = usePasskeySupport();
  const token = useRef<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const actions = useMemo(
    () =>
      createFlowActions(client, {
        callbackURL: redirect,
        captchaToken: () => token.current,
        errorCallbackURL: withRedirect("/magic-link", redirect),
        // Each token is single-use: the widget fetches a fresh one.
        onCaptchaUsed: () => setCaptchaKey((key) => key + 1),
        passkey: () => client.signIn.passkey(),
        resetPasswordURL: "/reset-password",
        socialErrorCallbackURL: withRedirect("/sign-in", redirect),
        socialFlow: { kind: "redirect" },
        verifyEmailURL: withRedirect("/verify-email", redirect),
      }),
    [client, redirect]
  );

  const flow = useAuthFlow({ actions, mode });

  const methods = useMemo((): AuthMethod[] => {
    const list: AuthMethod[] = ["password", "emailCode", "magicLink"];
    if (config.google) {
      list.push("google");
    }
    if (config.apple) {
      list.push("apple");
    }
    if (passkeys && mode === "signIn") {
      list.push("passkey");
    }
    return list;
  }, [config.apple, config.google, mode, passkeys]);

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
    router
      .invalidate()
      .then(() => router.navigate({ href: redirect, replace: true }))
      .catch((navigationError: unknown) => {
        console.error(
          "[auth] Failed to leave the sign-in page:",
          navigationError
        );
      });
  }, [done, redirect, refetch, router, signedIn, t, toast]);

  const onToken = useCallback((value: string | null) => {
    token.current = value;
  }, []);

  const { description, title } = useTitle(flow);
  const showSwitch = flow.state.step === "email" && mode !== "forgotPassword";

  return (
    <AuthCard description={description} title={title}>
      {error && flow.state.step === "email" ? (
        <Text role="alert" size="body-sm" tone="danger">
          {t("auth.errors.generic")}
        </Text>
      ) : null}
      {flow.state.step === "email" ? null : (
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
          <Text as="span" className="truncate" size="body-sm">
            {flow.state.email}
          </Text>
          {flow.state.step === "done" ? null : (
            <Button onClick={flow.changeEmail} size="sm" variant="ghost">
              {t("auth.email.change")}
            </Button>
          )}
        </div>
      )}
      <StepBody flow={flow} methods={methods} redirect={redirect} />
      {config.turnstileSiteKey && flow.state.step !== "done" ? (
        <Turnstile
          onToken={onToken}
          resetKey={captchaKey}
          siteKey={config.turnstileSiteKey}
        />
      ) : null}
      {showSwitch ? (
        <Text className="text-center" size="body-sm" tone="muted">
          {mode === "signIn" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <TextLink asChild>
            <Link
              search={redirect === "/" ? {} : { redirect }}
              to={mode === "signIn" ? "/sign-up" : "/sign-in"}
            >
              {mode === "signIn" ? t("auth.signUpLink") : t("nav.signIn")}
            </Link>
          </TextLink>
        </Text>
      ) : null}
      {mode === "forgotPassword" ? null : (
        <Text className="text-center" size="caption" tone="muted">
          {t("auth.legal")}
        </Text>
      )}
    </AuthCard>
  );
}
