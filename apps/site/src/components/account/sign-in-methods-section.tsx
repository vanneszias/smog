import {
  type Account,
  canUnlink,
  type Passkey,
  type SignInMethodsActions,
  useChangePasswordForm,
  usePasskeys,
  useSignInMethods,
} from "@smog/account/client";
import { PASSWORD_MIN_LENGTH, type SocialProvider } from "@smog/auth/react";
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
import { useActionToast, useShowFeedback } from "./use-action-toast";

const rootApi = getRouteApi("__root__");
const ACCOUNT_PATH = "/account";

type Methods = NonNullable<Account["me"]>["methods"];

function PasswordDialog({
  actions,
  onDone,
  open,
  setOpen,
}: {
  actions: SignInMethodsActions;
  onDone: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const form = useChangePasswordForm(actions);
  const show = useShowFeedback();
  const { setConfirm, setCurrent, setNext, submit } = form;

  const onCurrent = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setCurrent(event.target.value),
    [setCurrent]
  );
  const onNext = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNext(event.target.value),
    [setNext]
  );
  const onConfirm = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setConfirm(event.target.value),
    [setConfirm]
  );
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const feedback = await submit();
      if (feedback) {
        show(feedback);
        if (feedback.variant === "success") {
          onDone();
        }
      }
    },
    [onDone, show, submit]
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent title={t("account.methods.changePassword")}>
        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
          <Field
            error={form.errorFor("current")}
            label={t("account.methods.currentPassword")}
          >
            <Input
              autoComplete="current-password"
              onChange={onCurrent}
              type="password"
              value={form.values.current}
            />
          </Field>
          <Field
            error={form.errorFor("next")}
            hint={t("auth.password.ruleMinLength", {
              min: PASSWORD_MIN_LENGTH,
            })}
            label={t("auth.password.newLabel")}
          >
            <Input
              autoComplete="new-password"
              onChange={onNext}
              type="password"
              value={form.values.next}
            />
          </Field>
          <Field
            error={form.errorFor("confirm")}
            label={t("auth.password.confirmLabel")}
          >
            <Input
              autoComplete="new-password"
              onChange={onConfirm}
              type="password"
              value={form.values.confirm}
            />
          </Field>
          <DialogFooter>
            <Button loading={form.pending} type="submit">
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordRow({
  actions,
  methods,
}: {
  actions: SignInMethodsActions;
  methods: Methods;
}): ReactNode {
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
        <PasswordDialog
          actions={actions}
          onDone={close}
          open={open}
          setOpen={setOpen}
        />
      ) : null}
    </AccountRow>
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
}): ReactNode {
  const { t } = useTranslation();
  const { link, pending, unlink } = actions;
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
              disabled={
                !removable || (pending !== null && pending !== provider)
              }
              icon={<Unlink />}
              loading={pending === provider}
              variant="secondary"
            >
              {t("account.methods.unlink")}
            </Button>
          </AlertDialog>
        ) : (
          <Button
            disabled={pending !== null && pending !== provider}
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
  const client = useAuthClient();
  // One instance for the section, so one method change runs at a time.
  const actions = useSignInMethods({ client });
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
          <PasswordRow actions={actions} methods={methods} />
          <PasskeysRow />
          {providers.map((provider) => (
            <ProviderRow
              actions={actions}
              key={provider}
              methods={methods}
              provider={provider}
            />
          ))}
        </div>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </AccountSection>
  );
}
