import {
  type Account,
  deleteFailureMessage,
  exportFileName,
  serializeExport,
  useDeleteAccount,
  useExport,
} from "@smog/account/client";
import { DELETE_CONFIRMATION } from "@smog/account/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Button,
  Field,
  Input,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-web";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { AnalyticsSwitch } from "@/components/consent-banner";
import { useAuthClient } from "@/lib/auth-client";
import { AccountRow, AccountSection } from "./section";
import { useSignInAgain } from "./use-action-toast";

/** Saves `text` as a file through a temporary object URL. */
function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportRow(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { exportAccount, status } = useExport();
  const save = useCallback(async () => {
    try {
      download(serializeExport(await exportAccount()), exportFileName());
      toast({ title: t("account.privacy.exported"), variant: "success" });
    } catch {
      // `useExport` logged it.
      toast({ title: t("account.privacy.exportFailed"), variant: "danger" });
    }
  }, [exportAccount, t, toast]);
  return (
    <AccountRow
      action={
        <Button
          icon={<Download />}
          loading={status === "exporting"}
          onClick={save}
          variant="secondary"
        >
          {t("account.privacy.export")}
        </Button>
      }
      description={t("account.privacy.exportDescription")}
      title={t("account.privacy.export")}
    >
      <Text className="mt-1" size="body-sm" tone="warning">
        {t("account.export.sensitive")}
      </Text>
    </AccountRow>
  );
}

/**
 * Privacy: the analytics decision, the policy and (signed in) the export.
 * Guests get the switch only: their data never leaves the device.
 */
export function PrivacySection({ signedIn }: { signedIn: boolean }): ReactNode {
  const { t } = useTranslation();
  return (
    <AccountSection title={t("account.privacy.title")}>
      <div className="flex flex-col gap-2">
        <AnalyticsSwitch />
        <TextLink className="self-start text-body-sm" href="/privacy">
          {t("account.privacy.policy")}
        </TextLink>
      </div>
      {signedIn ? (
        <div className="flex flex-col gap-4 border-border-subtle border-t pt-4">
          <ExportRow />
        </div>
      ) : null}
    </AccountSection>
  );
}

/**
 * Deletion (spec §5.3): an AlertDialog where the user types DELETE (and
 * the password, when the account has one). A session that is too old
 * without a password needs a fresh sign-in, which the dialog offers.
 */
export function DeleteAccountSection({
  account,
}: {
  account: Account;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useAuthClient();
  const navigate = useNavigate();
  const router = useRouter();
  const signInAgain = useSignInAgain();
  // Leave the page as part of signing out: `useDeleteAccount` clears the
  // query cache next, and this page's queries must not refetch for a user
  // that no longer exists.
  const signOut = useCallback(async () => {
    const result = await client.signOut();
    await navigate({ replace: true, to: "/" });
    return result;
  }, [client, navigate]);
  const { deleteAccount, error, status } = useDeleteAccount({ signOut });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  // Radix closes the dialog on confirm; keep it open while the call runs.
  const deleting = useRef(false);
  const needsPassword = account.me?.methods.password ?? false;
  const ready =
    typed.trim() === DELETE_CONFIRMATION && (!needsPassword || password !== "");

  const onOpenChange = useCallback((next: boolean) => {
    if (next || !deleting.current) {
      setOpen(next);
    }
    if (!(next || deleting.current)) {
      setTyped("");
      setPassword("");
    }
  }, []);
  const onTyped = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTyped(event.target.value);
  }, []);
  const onPassword = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  const confirm = useCallback(async () => {
    deleting.current = true;
    try {
      await deleteAccount({
        confirm: DELETE_CONFIRMATION,
        ...(needsPassword ? { password } : {}),
      });
    } catch {
      // The dialog shows `error`; `useDeleteAccount` logged it.
      return;
    } finally {
      deleting.current = false;
    }
    toast({ title: t("account.delete.deleted"), variant: "success" });
    await router.invalidate();
  }, [deleteAccount, needsPassword, password, router, t, toast]);

  const failure = status === "error" && error ? error : null;
  return (
    <AccountSection
      description={t("account.delete.description")}
      title={t("account.delete.title")}
      tone="danger"
    >
      <div>
        <AlertDialog
          body={
            <>
              <Field
                label={t("account.delete.confirmLabel", {
                  word: DELETE_CONFIRMATION,
                })}
              >
                <Input
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={onTyped}
                  spellCheck={false}
                  value={typed}
                />
              </Field>
              {needsPassword ? (
                <Field label={t("account.delete.password")}>
                  <Input
                    autoComplete="current-password"
                    onChange={onPassword}
                    type="password"
                    value={password}
                  />
                </Field>
              ) : null}
              {failure ? (
                <div className="flex flex-col items-start gap-2" role="alert">
                  <Text size="body-sm" tone="danger">
                    {t(deleteFailureMessage(failure))}
                  </Text>
                  {failure === "SESSION_NOT_FRESH" ? (
                    <Button onClick={signInAgain} size="sm" variant="secondary">
                      {t("account.delete.signInAgain")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          }
          confirmDisabled={!ready}
          confirmLabel={t("account.delete.action")}
          description={t("account.delete.dialogDescription")}
          loading={status === "deleting"}
          onConfirm={confirm}
          onOpenChange={onOpenChange}
          open={open}
          title={t("account.delete.dialogTitle")}
          tone="danger"
        >
          <Button icon={<Trash2 />} variant="danger">
            {t("account.delete.action")}
          </Button>
        </AlertDialog>
      </div>
    </AccountSection>
  );
}
