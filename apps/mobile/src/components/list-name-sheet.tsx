import { useTranslation } from "@smog/i18n/react";
import { LIST_NAME_MAX } from "@smog/lists/schema";
import {
  Button,
  Field,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
} from "@smog/ui-native";
import { type ReactElement, useCallback, useEffect, useState } from "react";

export interface ListNameSheetProps {
  /** The name the field starts with (rename), empty for a new list. */
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  /** Saves the trimmed name; the sheet closes once it resolves. */
  onSubmit: (name: string) => Promise<void>;
  open: boolean;
  submitLabel: string;
  title: string;
}

/** A sheet with the list name field: creating and renaming a list. */
export function ListNameSheet({
  initialName = "",
  onOpenChange,
  onSubmit,
  open,
  submitLabel,
  title,
}: ListNameSheetProps): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setFailed(false);
    }
  }, [initialName, open]);
  const trimmed = name.trim();
  const submit = useCallback(async () => {
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (error) {
      console.error("[lists] Failed to save the list name:", error);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [onOpenChange, onSubmit, saving, trimmed]);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent title={title}>
        <Field
          error={failed ? t("states.actionFailed") : undefined}
          label={t("lists.nameLabel")}
        >
          <Input
            autoFocus
            maxLength={LIST_NAME_MAX}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder={t("lists.newListPlaceholder")}
            returnKeyType="done"
            value={name}
          />
        </Field>
        <SheetFooter>
          <Button disabled={!trimmed} loading={saving} onPress={submit}>
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
