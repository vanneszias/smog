import {
  type Account,
  canUnlink,
  type Passkey,
  usePasskeys,
  useSignInMethods,
} from "@smog/account/client";
import {
  newPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type SocialProvider,
} from "@smog/auth/react";
import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  IconButton,
  Input,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Fingerprint, KeyRound, Link2, Trash2, Unlink } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { useAuthClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/locale";
import { usePasskeySupport } from "@/lib/passkeys";
import { AccountRow, AccountSection } from "./section";
import { useActionErrorMessage, useActionToast } from "./use-action-toast";

const rootApi = getRouteApi("__root__");
const ACCOUNT_PATH = "/account";

type Methods = NonNullable<Account["me"]>["methods"];

function PasswordDialog({
  onDone,
  open,
  setOpen,
}: {
  onDone: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}): ReactNode {
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

  const onCurrent = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCurrent(event.target.value);
  }, []);
  const onNext = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setNext(event.target.value);
  }, []);
  const onConfirm = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setConfirm(event.target.value);
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
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
        setCurrent("");
        setNext("");
        setConfirm("");
        onDone();
        return;
      }
      if (result.error === "INVALID_PASSWORD") {
        setError({ field: "current", text: message(result.error) });
      } else if (result.error.startsWith("PASSWORD_TOO")) {
        setError({ field: "next", text: message(result.error) });
      } else {
        report(result, "");
      }
    },
    [changePassword, confirm, current, message, next, onDone, report, t]
  );

  const errorFor = (field: "current" | "next" | "confirm") =>
    error?.field === field ? error.text : undefined;
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent title={t("account.methods.changePassword")}>
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <Field
            error={errorFor("current")}
            label={t("account.methods.currentPassword")}
          >
            <Input
              autoComplete="current-password"
              onChange={onCurrent}
              type="password"
              value={current}
            />
          </Field>
          <Field
            error={errorFor("next")}
            hint={t("auth.password.ruleMinLength", {
              min: PASSWORD_MIN_LENGTH,
            })}
            label={t("auth.password.newLabel")}
          >
            <Input
              autoComplete="new-password"
              onChange={onNext}
              type="password"
              value={next}
            />
          </Field>
          <Field
            error={errorFor("confirm")}
            label={t("auth.password.confirmLabel")}
          >
            <Input
              autoComplete="new-password"
              onChange={onConfirm}
              type="password"
              value={confirm}
            />
          </Field>
          <DialogFooter>
            <Button loading={pending === "password"} type="submit">
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordRow({ methods }: { methods: Methods }): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <AccountRow
      action={
        methods.password ? (
          <Button icon={<KeyRound />} onClick={show} variant="secondary">
            {t("account.methods.changePassword")}
          </Button>
        ) : (
          <Button asChild icon={<KeyRound />} variant="secondary">
            <Link search={{ redirect: ACCOUNT_PATH }} to="/forgot-password">
              {t("account.methods.setPassword")}
            </Link>
          </Button>
        )
      }
      description={
        methods.password
          ? t("account.methods.passwordSet")
          : `${t("account.methods.passwordNone")} ${t("account.methods.setPasswordHint")}`
      }
      title={t("account.methods.password")}
    >
      {methods.password ? (
        <PasswordDialog onDone={close} open={open} setOpen={setOpen} />
      ) : null}
    </AccountRow>
  );
}

function ProviderRow({
  methods,
  provider,
}: {
  methods: Methods;
  provider: SocialProvider;
}): ReactNode {
  const { t } = useTranslation();
  const client = useAuthClient();
  const { link, pending, unlink } = useSignInMethods({ client });
  const report = useActionToast();
  const label = t(`account.methods.${provider}`);
  const linked = methods[provider];
  const removable = canUnlink(methods, provider);

  const startLink = useCallback(async () => {
    const result = await link(provider, {
      callbackURL: ACCOUNT_PATH,
      errorCallbackURL: ACCOUNT_PATH,
    });
    // On success the browser is already on its way to the provider.
    if (!result.ok) {
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
    <AccountRow
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
              icon={<Unlink />}
              loading={pending === provider}
              variant="secondary"
            >
              {t("account.methods.unlink")}
            </Button>
          </AlertDialog>
        ) : (
          <Button
            icon={<Link2 />}
            loading={pending === provider}
            onClick={startLink}
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
          <span>{label}</span>
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

function PasskeyItem({
  onRemove,
  passkey,
}: {
  onRemove: (id: string) => Promise<void>;
  passkey: Passkey;
}): ReactNode {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const remove = useCallback(() => onRemove(passkey.id), [onRemove, passkey]);
  const name = passkey.name ?? t("account.methods.passkeyName");
  return (
    <li className="flex min-h-touch items-center gap-3">
      <Fingerprint
        aria-hidden="true"
        className="size-5 shrink-0 text-foreground-muted"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Text className="truncate" weight="medium">
          {name}
        </Text>
        <Text size="body-sm" tone="muted">
          {t("account.methods.addedOn", {
            date: formatDate(passkey.createdAt, locale),
          })}
        </Text>
      </div>
      <AlertDialog
        confirmLabel={t("common.delete")}
        description={t("account.methods.removePasskeyDescription")}
        onConfirm={remove}
        title={t("account.methods.removePasskeyTitle")}
        tone="danger"
      >
        <IconButton
          icon={<Trash2 />}
          label={`${t("account.methods.removePasskey")}: ${name}`}
        />
      </AlertDialog>
    </li>
  );
}

function PasskeysRow(): ReactNode {
  const { t } = useTranslation();
  const client = useAuthClient();
  const supported = usePasskeySupport();
  const { add, passkeys, remove, status } = usePasskeys({ client });
  const report = useActionToast();
  const [adding, setAdding] = useState(false);

  const addPasskey = useCallback(async () => {
    setAdding(true);
    try {
      report(await add(), t("auth.passkey.added"));
    } finally {
      setAdding(false);
    }
  }, [add, report, t]);
  const removePasskey = useCallback(
    async (id: string) => {
      report(await remove(id), t("account.methods.passkeyRemoved"));
    },
    [remove, report, t]
  );

  return (
    <AccountRow
      action={
        supported ? (
          <Button
            icon={<Fingerprint />}
            loading={adding}
            onClick={addPasskey}
            variant="secondary"
          >
            {t("auth.passkey.add")}
          </Button>
        ) : null
      }
      description={
        supported
          ? t("account.methods.passkeysDescription")
          : t("auth.passkey.unsupported")
      }
      title={t("account.methods.passkeys")}
    >
      {status === "loading" ? <Skeleton className="mt-2 h-11 w-64" /> : null}
      {status === "ready" && passkeys.length === 0 ? (
        <Text className="mt-1" size="body-sm" tone="muted">
          {t("account.methods.noPasskeys")}
        </Text>
      ) : null}
      {passkeys.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {passkeys.map((passkey) => (
            <PasskeyItem
              key={passkey.id}
              onRemove={removePasskey}
              passkey={passkey}
            />
          ))}
        </ul>
      ) : null}
    </AccountRow>
  );
}

/** Password, passkeys (web) and the linked Google / Apple accounts. */
export function SignInMethodsSection({
  account,
}: {
  account: Account;
}): ReactNode {
  const { t } = useTranslation();
  const { auth: config } = rootApi.useLoaderData();
  const methods = account.me?.methods;
  const providers = (["google", "apple"] as const).filter(
    // A linked provider stays visible even when it is switched off.
    (provider) => config[provider] || methods?.[provider]
  );
  return (
    <AccountSection
      description={t("account.methods.description")}
      title={t("account.methods.title")}
    >
      {methods ? (
        <div className="flex flex-col gap-4">
          <PasswordRow methods={methods} />
          <PasskeysRow />
          {providers.map((provider) => (
            <ProviderRow key={provider} methods={methods} provider={provider} />
          ))}
        </div>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </AccountSection>
  );
}
