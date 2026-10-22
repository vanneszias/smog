import { useTranslation } from "@smog/i18n/react";
import {
  languageRefusalOf,
  useLanguageActions,
  useLanguages,
  validationCodeOf,
} from "@smog/translation/client";
import type { LanguageRow } from "@smog/translation/schema";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Switch,
  useToast,
} from "@smog/ui-web";
import { Pencil, Plus } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

interface FormState {
  code: string;
  intlTag: string;
  name: string;
  sortOrder: string;
}

const EMPTY: FormState = { code: "", intlTag: "", name: "", sortOrder: "" };

function formOf(row: LanguageRow): FormState {
  return {
    code: row.code,
    intlTag: row.intlTag,
    name: row.name,
    sortOrder: String(row.sortOrder),
  };
}

interface LanguageDialogProps {
  /** The language being changed; `null` adds a new one. */
  editing: LanguageRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** The form of a new language (code, native name, Intl tag, order) or of a change to one. */
function LanguageDialog({
  editing,
  onOpenChange,
  open,
}: LanguageDialogProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { create, update } = useLanguageActions();
  const [form, setForm] = useState<FormState>(() =>
    editing ? formOf(editing) : EMPTY
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const pending = create.isPending || update.isPending;
  const set = useCallback(
    (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setForm((current) => ({ ...current, [field]: value }));
    },
    []
  );
  const onFailure = useCallback(
    (error: unknown) => {
      const next: Partial<Record<keyof FormState, string>> = {};
      if (validationCodeOf(error, "code")) {
        next.code = t("admin.translation.languages.errors.code");
      }
      if (validationCodeOf(error, "intlTag")) {
        next.intlTag = t("admin.translation.languages.errors.intlTag");
      }
      if ((error as { code?: unknown }).code === "CONFLICT") {
        next.code = t("admin.translation.languages.errors.exists");
      }
      if (Object.keys(next).length > 0) {
        setErrors(next);
        return;
      }
      toast({
        title: t("admin.translation.languages.errors.failed"),
        variant: "danger",
      });
    },
    [t, toast]
  );
  const done = useCallback(() => {
    toast({
      title: t("admin.translation.languages.saved"),
      variant: "success",
    });
    onOpenChange(false);
  }, [onOpenChange, t, toast]);
  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      setErrors({});
      const sortOrder =
        form.sortOrder.trim() === "" ? undefined : Number(form.sortOrder);
      if (
        sortOrder !== undefined &&
        !(Number.isInteger(sortOrder) && sortOrder >= 0)
      ) {
        setErrors({ sortOrder: t("admin.translation.languages.errors.order") });
        return;
      }
      if (editing) {
        update.mutate(
          {
            code: editing.code,
            intlTag: form.intlTag,
            name: form.name,
            sortOrder,
          },
          { onError: onFailure, onSuccess: done }
        );
      } else {
        create.mutate(
          {
            code: form.code.trim(),
            enabled: true,
            intlTag: form.intlTag,
            name: form.name,
            sortOrder,
          },
          { onError: onFailure, onSuccess: done }
        );
      }
    },
    [create, done, editing, form, onFailure, t, update]
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        description={t("admin.translation.languages.dialogDescription")}
        title={
          editing
            ? t("admin.translation.languages.editTitle", {
                language: editing.name,
              })
            : t("admin.translation.languages.addTitle")
        }
      >
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field
            error={errors.code}
            hint={t("admin.translation.languages.codeHint")}
            label={t("admin.translation.languages.code")}
            required
          >
            <Input
              autoCapitalize="off"
              disabled={editing !== null}
              onChange={set("code")}
              value={form.code}
            />
          </Field>
          <Field
            error={errors.name}
            hint={t("admin.translation.languages.nameHint")}
            label={t("admin.translation.languages.name")}
            required
          >
            <Input onChange={set("name")} value={form.name} />
          </Field>
          <Field
            error={errors.intlTag}
            hint={t("admin.translation.languages.intlTagHint")}
            label={t("admin.translation.languages.intlTag")}
            required
          >
            <Input
              autoCapitalize="off"
              onChange={set("intlTag")}
              value={form.intlTag}
            />
          </Field>
          <Field
            error={errors.sortOrder}
            hint={t("admin.translation.languages.orderHint")}
            label={t("admin.translation.languages.order")}
            optional
          >
            <Input
              inputMode="numeric"
              onChange={set("sortOrder")}
              value={form.sortOrder}
            />
          </Field>
          <DialogFooter>
            <Button loading={pending} type="submit">
              {t("admin.translation.languages.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditButton({
  onEdit,
  row,
}: {
  onEdit: (row: LanguageRow) => void;
  row: LanguageRow;
}): ReactNode {
  const { t } = useTranslation();
  const edit = useCallback(() => onEdit(row), [onEdit, row]);
  return (
    <Button
      aria-label={t("admin.translation.languages.editLabel", {
        language: row.name,
      })}
      icon={<Pencil />}
      onClick={edit}
      size="sm"
      variant="ghost"
    >
      {t("admin.translation.languages.edit")}
    </Button>
  );
}

function languageCode(row: LanguageRow): string {
  return row.code;
}

function EnabledSwitch({ row }: { row: LanguageRow }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { update } = useLanguageActions();
  const onChange = useCallback(
    (enabled: boolean) =>
      update.mutate(
        { code: row.code, enabled },
        {
          onError: (error) =>
            toast({
              title:
                languageRefusalOf(error) === "defaultLanguage"
                  ? t("admin.translation.languages.errors.default")
                  : t("admin.translation.languages.errors.failed"),
              variant: "danger",
            }),
        }
      ),
    [row.code, t, toast, update]
  );
  return (
    <Switch
      checked={row.enabled}
      disabled={row.isDefault || update.isPending}
      label={t("admin.translation.languages.enabledLabel", {
        language: row.name,
      })}
      onCheckedChange={onChange}
    />
  );
}

/**
 * The languages (admin only): the enabled ones are the columns of the
 * strings table and the language menu. A language added here shows the
 * default language's text until it is translated. The default language
 * stays enabled.
 */
export function LanguagesTable(): ReactNode {
  const { t } = useTranslation();
  const languages = useLanguages();
  const [dialog, setDialog] = useState<{
    editing: LanguageRow | null;
    key: number;
  } | null>(null);
  const openAdd = useCallback(
    () =>
      setDialog((current) => ({ editing: null, key: (current?.key ?? 0) + 1 })),
    []
  );
  const openEdit = useCallback(
    (row: LanguageRow) =>
      setDialog((current) => ({ editing: row, key: (current?.key ?? 0) + 1 })),
    []
  );
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDialog(null);
    }
  }, []);
  const columns = useMemo<DataTableColumn<LanguageRow>[]>(
    () => [
      {
        cell: (row) => <code>{row.code}</code>,
        header: t("admin.translation.languages.code"),
        id: "code",
      },
      {
        cell: (row) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            {row.name}
            {row.isDefault ? (
              <Badge variant="primary">
                {t("admin.translation.languages.default")}
              </Badge>
            ) : null}
          </span>
        ),
        header: t("admin.translation.languages.name"),
        id: "name",
      },
      {
        cell: (row) => <code>{row.intlTag}</code>,
        header: t("admin.translation.languages.intlTag"),
        id: "intlTag",
      },
      {
        align: "end",
        cell: (row) => row.sortOrder,
        header: t("admin.translation.languages.order"),
        id: "order",
      },
      {
        cell: (row) => <EnabledSwitch row={row} />,
        header: t("admin.translation.languages.enabled"),
        id: "enabled",
      },
      {
        align: "end",
        cell: (row) => <EditButton onEdit={openEdit} row={row} />,
        header: <span className="sr-only">{t("admin.table.actions")}</span>,
        id: "actions",
      },
    ],
    [openEdit, t]
  );
  const { refetch } = languages;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the languages:", error);
    });
  }, [refetch]);

  if (languages.isError && !languages.data) {
    return (
      <ErrorState
        description={t("admin.translation.loadError")}
        level={2}
        onRetry={retry}
      />
    );
  }
  if (!languages.data) {
    return <Skeleton aria-busy="true" className="h-48 w-full" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button icon={<Plus />} onClick={openAdd}>
          {t("admin.translation.languages.add")}
        </Button>
      </div>
      <DataTable
        aria-label={t("admin.translation.languages.label")}
        columns={columns}
        getRowId={languageCode}
        rows={languages.data.items}
      />
      {dialog ? (
        <LanguageDialog
          editing={dialog.editing}
          key={dialog.key}
          onOpenChange={onOpenChange}
          open
        />
      ) : null}
    </div>
  );
}
