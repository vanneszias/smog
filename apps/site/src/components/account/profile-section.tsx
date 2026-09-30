import type { Account } from "@smog/account/client";
import { PROFILE_NAME_MAX } from "@smog/account/schema";
import { isLocale, LOCALES } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Button, Field, Input, Select, useToast } from "@smog/ui-web";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { AccountSection } from "./section";

/** The email language picker's "follow the site" value (`locale: null`). */
const AUTO = "auto";

/** Name (editable), email (read-only) and the language of our emails. */
export function ProfileSection({ account }: { account: Account }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { me, updateProfile } = account;
  const [name, setName] = useState(me?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = me?.name ?? "";
  useEffect(() => {
    setName(saved);
  }, [saved]);

  const changeName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const save = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
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
    },
    [name, t, toast, updateProfile]
  );

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
    <AccountSection title={t("account.profile.title")}>
      <form className="flex flex-col gap-4" noValidate onSubmit={save}>
        <Field error={error} label={t("account.profile.name")}>
          <Input
            autoComplete="name"
            maxLength={PROFILE_NAME_MAX}
            onChange={changeName}
            value={name}
          />
        </Field>
        <Field
          hint={t("account.profile.emailHint")}
          label={t("account.profile.email")}
        >
          <Input readOnly type="email" value={me?.email ?? ""} />
        </Field>
        <div>
          <Button
            disabled={name.trim() === saved}
            loading={saving}
            type="submit"
            variant="secondary"
          >
            {t("common.save")}
          </Button>
        </div>
      </form>
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
    </AccountSection>
  );
}
