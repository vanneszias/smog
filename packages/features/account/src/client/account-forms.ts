import {
  newPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DELETE_CONFIRMATION } from "../schema";
import {
  type AccountActionError,
  type AccountActionResult,
  accountActionMessage,
} from "./sign-in-methods";
import type { Account } from "./use-account";
import {
  type DeleteAccountFailure,
  deleteFailureMessage,
  type UseDeleteAccountOptions,
  useDeleteAccount,
} from "./use-delete-account";
import type { SignInMethodsActions } from "./use-sign-in-methods";

/*
 * The account screens' form logic, headless: both apps render the fields
 * with their kit and show `ActionFeedback` as a toast. Rules and words
 * live here once.
 */

/** The words for a failed account action (the password ones take min/max). */
export function useActionErrorMessage(): (error: AccountActionError) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: AccountActionError) =>
      t(accountActionMessage(error), {
        max: PASSWORD_MAX_LENGTH,
        min: PASSWORD_MIN_LENGTH,
      }),
    [t]
  );
}

/** What a toast says about an account action. */
export interface ActionFeedback {
  /** Offer "Sign in again" (a fresh session is needed). */
  signInAgain: boolean;
  title: string;
  variant: "success" | "danger";
}

/** Turns an action's result into its toast: `success`, or why it failed. */
export function useActionFeedback(): (
  result: AccountActionResult,
  success: string
) => ActionFeedback {
  const message = useActionErrorMessage();
  return useCallback(
    (result: AccountActionResult, success: string): ActionFeedback =>
      result.ok
        ? { signInAgain: false, title: success, variant: "success" }
        : {
            signInAgain: result.error === "SIGN_IN_AGAIN",
            title: message(result.error),
            variant: "danger",
          },
    [message]
  );
}

export type PasswordField = "current" | "next" | "confirm";

export interface ChangePasswordForm {
  errorFor: (field: PasswordField) => string | undefined;
  pending: boolean;
  setConfirm: (value: string) => void;
  setCurrent: (value: string) => void;
  setNext: (value: string) => void;
  /**
   * Checks the fields, then changes the password. Resolves the toast to
   * show (success clears the form; a failure no field explains), or `null`
   * when the problem is shown on a field.
   */
  submit: () => Promise<ActionFeedback | null>;
  values: Record<PasswordField, string>;
}

const EMPTY_PASSWORDS: Record<PasswordField, string> = {
  confirm: "",
  current: "",
  next: "",
};

/**
 * Change password: the current one, the new one twice. `actions` is the
 * screen's one `useSignInMethods`, so one method change runs at a time.
 */
export function useChangePasswordForm(
  actions: Pick<SignInMethodsActions, "changePassword" | "pending">
): ChangePasswordForm {
  const { t } = useTranslation();
  const message = useActionErrorMessage();
  const feedback = useActionFeedback();
  const [values, setValues] = useState(EMPTY_PASSWORDS);
  const [error, setError] = useState<{
    field: PasswordField;
    text: string;
  } | null>(null);
  const { changePassword } = actions;

  const setCurrent = useCallback((current: string) => {
    setValues((all) => ({ ...all, current }));
  }, []);
  const setNext = useCallback((next: string) => {
    setValues((all) => ({ ...all, next }));
  }, []);
  const setConfirm = useCallback((confirm: string) => {
    setValues((all) => ({ ...all, confirm }));
  }, []);

  const submit = useCallback(async (): Promise<ActionFeedback | null> => {
    if (!values.current) {
      setError({ field: "current", text: t("auth.errors.passwordRequired") });
      return null;
    }
    const invalid = newPasswordError({
      confirm: values.confirm,
      password: values.next,
    });
    if (invalid) {
      setError({
        field: invalid === "passwordMismatch" ? "confirm" : "next",
        text: t(`auth.errors.${invalid}`, {
          max: PASSWORD_MAX_LENGTH,
          min: PASSWORD_MIN_LENGTH,
        }),
      });
      return null;
    }
    setError(null);
    const result = await changePassword({
      currentPassword: values.current,
      newPassword: values.next,
    });
    if (result.ok) {
      setValues(EMPTY_PASSWORDS);
      return feedback(result, t("account.methods.passwordChanged"));
    }
    if (result.error === "INVALID_PASSWORD") {
      setError({ field: "current", text: message(result.error) });
      return null;
    }
    if (
      result.error === "PASSWORD_TOO_SHORT" ||
      result.error === "PASSWORD_TOO_LONG"
    ) {
      setError({ field: "next", text: message(result.error) });
      return null;
    }
    return feedback(result, "");
  }, [changePassword, feedback, message, t, values]);

  const errorFor = useCallback(
    (field: PasswordField) => (error?.field === field ? error.text : undefined),
    [error]
  );
  return {
    errorFor,
    pending: actions.pending === "password",
    setConfirm,
    setCurrent,
    setNext,
    submit,
    values,
  };
}

export interface ProfileForm {
  /** The name differs from the saved one. */
  dirty: boolean;
  error: string | null;
  name: string;
  /** Saves the name: `false` (with `error`, or logged) when it did not. */
  save: () => Promise<boolean>;
  saving: boolean;
  setName: (name: string) => void;
}

/** The profile's name field, starting from (and following) the saved name. */
export function useProfileForm(account: Account): ProfileForm {
  const { t } = useTranslation();
  const saved = account.me?.name ?? "";
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { updateProfile } = account;
  useEffect(() => {
    setName(saved);
  }, [saved]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!name.trim()) {
      setError(t("auth.errors.nameRequired"));
      return false;
    }
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name });
      return true;
    } catch {
      // `useAccount` logged it; the app says so.
      return false;
    } finally {
      setSaving(false);
    }
  }, [name, t, updateProfile]);

  return {
    dirty: name.trim() !== saved,
    error,
    name,
    save,
    saving,
    setName,
  };
}

export interface DeleteAccountForm {
  /**
   * Deletes (`useDeleteAccount`): `true` once gone (the app then says so),
   * `false` when refused (`failure`; the dialog stays open).
   */
  confirm: () => Promise<boolean>;
  deleting: boolean;
  failure: DeleteAccountFailure | null;
  /** `failure` in words. */
  failureMessage: string | null;
  /**
   * The dialog's open state. Confirming closes the dialog in both kits; it
   * stays open while the call runs, and closing clears the fields.
   */
  onOpenChange: (open: boolean) => void;
  open: boolean;
  password: string;
  /** DELETE is typed, and the password when the account has one. */
  ready: boolean;
  setPassword: (password: string) => void;
  setTyped: (typed: string) => void;
  typed: string;
}

export interface UseDeleteAccountFormOptions extends UseDeleteAccountOptions {
  /** The account has a password: it is asked (`account.delete` requires it). */
  needsPassword: boolean;
}

/** The deletion dialog: type DELETE (and the password), then delete. */
export function useDeleteAccountForm({
  needsPassword,
  signOut,
}: UseDeleteAccountFormOptions): DeleteAccountForm {
  const { t } = useTranslation();
  const { deleteAccount, error, status } = useDeleteAccount({ signOut });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const deleting = useRef<boolean>(false);

  const onOpenChange = useCallback((next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (deleting.current) {
      return;
    }
    setOpen(false);
    setTyped("");
    setPassword("");
  }, []);

  const confirm = useCallback(async (): Promise<boolean> => {
    deleting.current = true;
    try {
      await deleteAccount({
        confirm: DELETE_CONFIRMATION,
        ...(needsPassword ? { password } : {}),
      });
      return true;
    } catch {
      // `useDeleteAccount` logged it and set `error`.
      return false;
    } finally {
      deleting.current = false;
    }
  }, [deleteAccount, needsPassword, password]);

  const failure = status === "error" ? error : null;
  return {
    confirm,
    deleting: status === "deleting",
    failure,
    failureMessage: failure ? t(deleteFailureMessage(failure)) : null,
    onOpenChange,
    open,
    password,
    ready:
      typed.trim() === DELETE_CONFIRMATION &&
      (!needsPassword || password !== ""),
    setPassword,
    setTyped,
    typed,
  };
}
