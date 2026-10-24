import { LESSON_TITLE_MAX } from "@smog/db/enums";
import {
  DEFAULT_LOCALE,
  formatDate,
  isLocale,
  type Translate,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useLessonActions, useLessonList } from "@smog/lessons/client";
import type { LessonListItem } from "@smog/lessons/schema";
import {
  AlertDialog,
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SearchField,
  Select,
  Skeleton,
  Switch,
  Text,
  useToast,
} from "@smog/ui-web";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Copy,
  Ellipsis,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocale } from "@/lib/locale";

/** Typing pauses this long before the list is searched. */
const SEARCH_DELAY_MS = 300;

/** A day in the page's language (Brussels time). */
function useLessonDate(): (ms: number) => string {
  const { i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  return useCallback(
    (ms: number) => formatDate(ms, locale, { dateStyle: "medium" }),
    [locale]
  );
}

function rowId(row: LessonListItem): string {
  return row.id;
}

/** A lesson's title, or the placeholder for one with no title at all. */
export function lessonTitle(t: Translate, item: { title: string }): string {
  return item.title === "" ? t("admin.lessons.untitled") : item.title;
}

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function LessonActions({
  item,
  onDelete,
  onDuplicate,
  onOpen,
}: {
  item: LessonListItem;
  onDelete: (item: LessonListItem) => void;
  onDuplicate: (item: LessonListItem) => void;
  onOpen: (item: LessonListItem) => void;
}): ReactNode {
  const { t } = useTranslation();
  const title = lessonTitle(t, item);
  const open = useCallback(() => onOpen(item), [item, onOpen]);
  const duplicate = useCallback(() => onDuplicate(item), [item, onDuplicate]);
  const remove = useCallback(() => onDelete(item), [item, onDelete]);
  const stop = useCallback(
    (event: MouseEvent | KeyboardEvent) => event.stopPropagation(),
    []
  );
  return (
    // Clicks and keys in the menu (a portal, but React bubbles through it)
    // must not reach the row's own open handler.
    // biome-ignore lint/a11y/noStaticElementInteractions: a presentation wrapper that only stops events
    <span
      className="flex justify-end"
      onClick={stop}
      onKeyDown={stop}
      role="presentation"
    >
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            icon={<Ellipsis />}
            label={t("admin.lessons.actions.label", { title })}
          />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<ExternalLink />} onSelect={open}>
            {t("admin.lessons.actions.open")}
          </MenuItem>
          <MenuItem icon={<Copy />} onSelect={duplicate}>
            {t("admin.lessons.actions.duplicate")}
          </MenuItem>
          {item.canEdit ? (
            <>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} onSelect={remove} variant="danger">
                {t("admin.lessons.actions.delete")}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
    </span>
  );
}

/** The "New lesson" dialog: a title in a language, an optional number; opens the builder. */
export function NewLessonButton(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { locale, languages } = useLocale();
  const { create } = useLessonActions();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [chosen, setChosen] = useState(locale);
  const options = useMemo(
    () =>
      languages.map((language) => ({
        label: language.name,
        value: language.code,
      })),
    [languages]
  );
  const onTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value),
    []
  );
  const onNumber = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNumber(event.target.value),
    []
  );
  const openDialog = useCallback(() => setOpen(true), []);
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = number.trim() === "" ? null : Number(number);
      create
        .mutateAsync({
          locale: chosen,
          number: Number.isInteger(parsed) ? parsed : null,
          title: title.trim(),
        })
        .then(async (created) => {
          setOpen(false);
          setTitle("");
          setNumber("");
          await navigate({
            params: { id: created.id },
            to: "/admin/lessons/$id",
          });
        })
        .catch((error: unknown) => {
          console.error("[lessons] Failed to create a lesson:", error);
          toast({
            title: t("admin.lessons.create.failed"),
            variant: "danger",
          });
        });
    },
    [chosen, create, navigate, number, t, title, toast]
  );
  return (
    <>
      <Button icon={<Plus />} onClick={openDialog}>
        {t("admin.lessons.new")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          description={t("admin.lessons.create.description")}
          title={t("admin.lessons.create.title")}
        >
          <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
            <Field label={t("admin.lessons.create.titleLabel")} required>
              <Input
                maxLength={LESSON_TITLE_MAX}
                onChange={onTitle}
                value={title}
              />
            </Field>
            <Field label={t("admin.lessons.create.languageLabel")}>
              <Select
                onValueChange={setChosen}
                options={options}
                value={chosen}
              />
            </Field>
            <Field
              hint={t("admin.lessons.numberHint")}
              label={t("admin.lessons.numberLabel")}
              optional
            >
              <Input
                inputMode="numeric"
                max={9999}
                min={0}
                onChange={onNumber}
                type="number"
                value={number}
              />
            </Field>
            <DialogFooter>
              <Button
                disabled={title.trim() === ""}
                loading={create.isPending}
                type="submit"
              >
                {t("admin.lessons.create.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The lessons of every teacher, newest change first (spec 5.3): a title
 * search, "my lessons", a row menu to open, duplicate (anyone) and delete
 * (the author or an admin, after a confirmation), and keyset paging.
 */
export function LessonList(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const formatDay = useLessonDate();
  const { duplicate, remove } = useLessonActions();
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const settled = useDebounced(q, SEARCH_DELAY_MS);
  const list = useLessonList({ mine, query: settled });
  const [deleting, setDeleting] = useState<LessonListItem | null>(null);
  const items = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data]
  );
  const { refetch } = list;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[lessons] Failed to reload the lessons:", error);
    });
  }, [refetch]);
  const { fetchNextPage } = list;
  const loadMore = useCallback(() => {
    fetchNextPage().catch((error: unknown) => {
      console.error("[lessons] Failed to load more lessons:", error);
    });
  }, [fetchNextPage]);
  const open = useCallback(
    (item: LessonListItem) => {
      navigate({ params: { id: item.id }, to: "/admin/lessons/$id" }).catch(
        (error: unknown) => {
          console.error("[lessons] Failed to open the lesson:", error);
        }
      );
    },
    [navigate]
  );
  const copy = useCallback(
    (item: LessonListItem) => {
      duplicate
        .mutateAsync({ id: item.id })
        .then(async (created) => {
          toast({ title: t("admin.lessons.duplicated"), variant: "success" });
          await navigate({
            params: { id: created.id },
            to: "/admin/lessons/$id",
          });
        })
        .catch((error: unknown) => {
          console.error("[lessons] Failed to duplicate the lesson:", error);
          toast({
            title: t("admin.lessons.duplicateFailed"),
            variant: "danger",
          });
        });
    },
    [duplicate, navigate, t, toast]
  );
  const confirmDelete = useCallback(() => {
    const target = deleting;
    if (!target) {
      return;
    }
    remove
      .mutateAsync({ id: target.id })
      .then(() => {
        toast({ title: t("admin.lessons.delete.done"), variant: "success" });
      })
      .catch((error: unknown) => {
        console.error("[lessons] Failed to delete the lesson:", error);
        toast({ title: t("admin.lessons.delete.failed"), variant: "danger" });
      });
    setDeleting(null);
  }, [deleting, remove, t, toast]);
  const onDeleteOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDeleting(null);
    }
  }, []);

  const columns = useMemo<DataTableColumn<LessonListItem>[]>(
    () => [
      {
        cell: (row) => (
          <span className="flex min-w-0 max-w-[16rem] flex-wrap items-center gap-2 font-medium sm:max-w-[28rem]">
            <span className="truncate">{lessonTitle(t, row)}</span>
            {row.mine ? (
              <Badge variant="accent">{t("admin.lessons.mineBadge")}</Badge>
            ) : null}
          </span>
        ),
        header: t("admin.lessons.columns.title"),
        id: "title",
      },
      {
        align: "end",
        cell: (row) => (row.number === null ? "" : String(row.number)),
        header: t("admin.lessons.columns.number"),
        id: "number",
      },
      {
        cell: (row) => row.authorName ?? t("admin.lessons.noAuthor"),
        header: t("admin.lessons.columns.author"),
        id: "author",
      },
      {
        align: "end",
        cell: (row) => String(row.gestureCount),
        header: t("admin.lessons.columns.gestures"),
        id: "gestures",
      },
      {
        cell: (row) => formatDay(row.updatedAt),
        header: t("admin.lessons.columns.updated"),
        id: "updated",
      },
      {
        cell: (row) => (
          <LessonActions
            item={row}
            onDelete={setDeleting}
            onDuplicate={copy}
            onOpen={open}
          />
        ),
        header: (
          <span className="sr-only">{t("admin.lessons.columns.actions")}</span>
        ),
        id: "actions",
      },
    ],
    [copy, formatDay, open, t]
  );

  let body: ReactNode;
  if (list.isError && items.length === 0) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else if (list.isPending) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (items.length === 0) {
    const filtered = settled.trim() !== "" || mine;
    body = (
      <EmptyState
        description={
          filtered
            ? t("admin.lessons.noResults.description")
            : t("admin.lessons.empty.description")
        }
        icon={<BookOpen />}
        level={2}
        title={
          filtered
            ? t("admin.lessons.noResults.title")
            : t("admin.lessons.empty.title")
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <DataTable
          aria-label={t("admin.lessons.title")}
          columns={columns}
          getRowId={rowId}
          onRowClick={open}
          rows={items}
          stickyHeader
        />
        {list.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              loading={list.isFetchingNextPage}
              onClick={loadMore}
              variant="secondary"
            >
              {t("admin.lessons.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <SearchField
            aria-label={t("admin.lessons.search")}
            onValueChange={setQ}
            placeholder={t("admin.lessons.searchPlaceholder")}
            value={q}
          />
        </div>
        <Switch
          checked={mine}
          label={t("admin.lessons.mine")}
          onCheckedChange={setMine}
        />
      </div>
      <Text aria-live="polite" className="sr-only" role="status">
        {list.isFetching ? t("search.searching") : ""}
      </Text>
      {body}
      <AlertDialog
        confirmLabel={t("admin.lessons.delete.confirm")}
        description={t("admin.lessons.delete.description", {
          title: deleting ? lessonTitle(t, deleting) : "",
        })}
        onConfirm={confirmDelete}
        onOpenChange={onDeleteOpenChange}
        open={deleting !== null}
        title={t("admin.lessons.delete.title")}
        tone="danger"
      />
    </div>
  );
}
