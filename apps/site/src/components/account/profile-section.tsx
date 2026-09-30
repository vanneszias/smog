import { type Account, useProfileForm } from "@smog/account/client";
import { PROFILE_NAME_MAX } from "@smog/account/schema";
import { useTranslation } from "@smog/i18n/react";
import { Button, Field, Input, useToast } from "@smog/ui-web";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
} from "react";
import { AccountSection } from "./section";

/**
 * Name (editable) and email (read-only). The language is under
 * Preferences: for a signed-in user it is also the language of our emails.
 */
export function ProfileSection({ account }: { account: Account }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const form = useProfileForm(account);
  const { save, setName } = form;

  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    [setName]
  );
  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (await save()) {
        toast({ title: t("account.profile.saved"), variant: "success" });
      } else if (form.name.trim()) {
        toast({ title: t("auth.errors.generic"), variant: "danger" });
      }
    },
    [form.name, save, t, toast]
  );

  return (
    <AccountSection title={t("account.profile.title")}>
      <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
        <Field error={form.error} label={t("account.profile.name")}>
          <Input
            autoComplete="name"
            maxLength={PROFILE_NAME_MAX}
            onChange={changeName}
            value={form.name}
          />
        </Field>
        <Field
          hint={t("account.profile.emailHint")}
          label={t("account.profile.email")}
        >
          <Input readOnly type="email" value={account.me?.email ?? ""} />
        </Field>
        <div>
          <Button
            disabled={!form.dirty}
            loading={form.saving}
            type="submit"
            variant="secondary"
          >
            {t("common.save")}
          </Button>
        </div>
      </form>
    </AccountSection>
  );
}
