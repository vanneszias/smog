import { useTranslation } from "@smog/i18n/react";
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from "@smog/lists/schema";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Textarea,
} from "@smog/ui-web";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

export interface ListFormValues {
  description: string;
  name: string;
}

/**
 * Create or edit a list: name (1–80) and an optional description (≤ 280),
 * trimmed by the hooks. `onSubmit` rejects to keep the dialog open.
 */
export function ListFormDialog({
  initial,
  onOpenChange,
  onSubmit,
  open,
  submitLabel,
  title,
}: {
  initial?: ListFormValues;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ListFormValues) => Promise<void>;
  open: boolean;
  submitLabel: string;
  title: string;
}): ReactNode {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  // Every opening starts from the list as it is now.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
    }
  }, [initial?.description, initial?.name, open]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (!name.trim()) {
        return;
      }
      setSaving(true);
      onSubmit({ description, name })
        .then(() => onOpenChange(false))
        .catch((error: unknown) => {
          console.error("[lists] Failed to save the list:", error);
        })
        .finally(() => setSaving(false));
    },
    [description, name, onOpenChange, onSubmit]
  );
  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => setName(event.target.value),
    []
  );
  const changeDescription = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void =>
      setDescription(event.target.value),
    []
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent title={title}>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field
            counter={{ count: name.length, max: LIST_NAME_MAX }}
            label={t("lists.nameLabel")}
            required
          >
            <Input
              maxLength={LIST_NAME_MAX}
              onChange={changeName}
              placeholder={t("lists.newListPlaceholder")}
              value={name}
            />
          </Field>
          <Field
            counter={{ count: description.length, max: LIST_DESCRIPTION_MAX }}
            label={t("lists.descriptionLabel")}
            optional
          >
            <Textarea
              maxLength={LIST_DESCRIPTION_MAX}
              onChange={changeDescription}
              rows={3}
              value={description}
            />
          </Field>
          <DialogFooter>
            <Button
              disabled={!name.trim()}
              loading={saving}
              type="submit"
              variant="primary"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
