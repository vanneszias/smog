import {
  deadLetterRefusalOf,
  useAdminDeadLetterActions,
  useAdminDeadLetters,
} from "@smog/admin/client";
import {
  DEAD_LETTER_STATUSES,
  type DeadLetter,
  type DeadLetterListInput,
  type DeadLetterStatus,
} from "@smog/admin/schema";
import { DEAD_LETTER_ORIGINS, type DeadLetterOrigin } from "@smog/db/enums";
import type { Translate, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  ErrorState,
  Field,
  Heading,
  Select,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { ChevronRight, ChevronsLeft, RotateCcw, Trash2 } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuditTime } from "../audit-data";
import { ColumnsMenu, useColumnVisibility } from "../data-table-parts";

const PINNED_COLUMNS = ["received", "actions"] as const;

/** The filters as they live in the URL (`/admin/dead-letters?…`). */
export interface DeadLetterSearch {
  /** The page's start (a cursor from the previous page). */
  cursor?: string | undefined;
  queue?: DeadLetterOrigin | undefined;
  /** `open` when absent. */
  status?: DeadLetterStatus | undefined;
}

function pick<T extends string>(
  value: unknown,
  values: readonly T[]
): T | undefined {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Every key set (`undefined` when absent or invalid), as the other admin screens do. */
export function validateDeadLetterSearch(
  search: Record<string, unknown>
): DeadLetterSearch {
  const cursor =
    typeof search.cursor === "string" &&
    search.cursor.length > 0 &&
    search.cursor.length <= 1024
      ? search.cursor
      : undefined;
  return {
    cursor,
    queue: pick(search.queue, DEAD_LETTER_ORIGINS),
    status: pick(search.status, DEAD_LETTER_STATUSES),
  };
}

const ALL = "all";

const QUEUE_LABEL_KEYS = {
  email: "admin.deadLetters.queues.email",
  events: "admin.deadLetters.queues.events",
} as const satisfies Record<DeadLetterOrigin, TranslationKey>;

const STATUS_LABEL_KEYS = {
  discarded: "admin.deadLetters.statuses.discarded",
  open: "admin.deadLetters.statuses.open",
  replayed: "admin.deadLetters.statuses.replayed",
} as const satisfies Record<DeadLetterStatus, TranslationKey>;

const STATUS_TONES = {
  discarded: "neutral",
  open: "warning",
  replayed: "success",
} as const satisfies Record<
  DeadLetterStatus,
  "neutral" | "success" | "warning"
>;

/** The reason codes `toDeadLetter` writes; anything else reads as "cannot be replayed". */
const REASON_KEYS: Record<string, TranslationKey> = {
  invalid_message: "admin.deadLetters.reasons.invalid_message",
  no_idempotency_key: "admin.deadLetters.reasons.no_idempotency_key",
  secret_template: "admin.deadLetters.reasons.secret_template",
};

function reasonText(t: Translate, letter: DeadLetter): string {
  return t(
    (letter.error && REASON_KEYS[letter.error]) ||
      "admin.deadLetters.notReplayable"
  );
}

function listInput(search: DeadLetterSearch): DeadLetterListInput {
  return {
    cursor: search.cursor,
    queue: search.queue,
    status: search.status ?? "open",
  };
}

export interface DeadLetterTableProps {
  onSearchChange: (next: DeadLetterSearch) => void;
  search: DeadLetterSearch;
}

/** The queue and status filters. */
function Filters({ onSearchChange, search }: DeadLetterTableProps): ReactNode {
  const { t } = useTranslation();
  const all = { label: t("admin.deadLetters.filters.all"), value: ALL };
  const onQueue = useCallback(
    (value: string) =>
      onSearchChange({
        ...search,
        cursor: undefined,
        queue: pick(value, DEAD_LETTER_ORIGINS),
      }),
    [onSearchChange, search]
  );
  const onStatus = useCallback(
    (value: string) =>
      onSearchChange({
        ...search,
        cursor: undefined,
        status: pick(value, DEAD_LETTER_STATUSES),
      }),
    [onSearchChange, search]
  );
  return (
    <fieldset className="grid grid-cols-2 items-end gap-3 sm:max-w-md">
      <legend className="sr-only">
        {t("admin.deadLetters.filters.label")}
      </legend>
      <Field label={t("admin.deadLetters.filters.status")}>
        <Select
          onValueChange={onStatus}
          options={DEAD_LETTER_STATUSES.map((status) => ({
            label: t(STATUS_LABEL_KEYS[status]),
            value: status,
          }))}
          value={search.status ?? "open"}
        />
      </Field>
      <Field label={t("admin.deadLetters.filters.queue")}>
        <Select
          onValueChange={onQueue}
          options={[
            all,
            ...DEAD_LETTER_ORIGINS.map((origin) => ({
              label: t(QUEUE_LABEL_KEYS[origin]),
              value: origin,
            })),
          ]}
          value={search.queue ?? ALL}
        />
      </Field>
    </fieldset>
  );
}

interface Pending {
  kind: "discard" | "replay";
  letter: DeadLetter;
}

/** `EMAIL_SENT_TTL_SECONDS` (`@smog/jobs`): 7 days. */
const SENT_MARKER_MS = 7 * 86_400_000;

function letterId(letter: DeadLetter): string {
  return letter.id;
}

/** The toast text for a failed replay or discard. */
function failureKey(error: unknown): TranslationKey {
  const reason = deadLetterRefusalOf(error);
  if (reason === "alreadyHandled") {
    return "admin.deadLetters.errors.alreadyHandled";
  }
  return reason === "notReplayable"
    ? "admin.deadLetters.errors.notReplayable"
    : "admin.deadLetters.errors.generic";
}

/** Replay (when it can be) and Discard for one open row. */
function RowActions({
  busy,
  letter,
  onAsk,
}: {
  busy: boolean;
  letter: DeadLetter;
  onAsk: (kind: Pending["kind"], letter: DeadLetter) => void;
}): ReactNode {
  const { t } = useTranslation();
  const replay = useCallback(() => onAsk("replay", letter), [letter, onAsk]);
  const discard = useCallback(() => onAsk("discard", letter), [letter, onAsk]);
  if (letter.status !== "open") {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-2">
      {letter.replayable ? (
        <Button
          aria-label={t("admin.deadLetters.replay.label", {
            type: letter.type,
          })}
          disabled={busy}
          icon={<RotateCcw />}
          onClick={replay}
          size="sm"
          variant="secondary"
        >
          {t("admin.deadLetters.replay.action")}
        </Button>
      ) : null}
      <Button
        aria-label={t("admin.deadLetters.discard.label", { type: letter.type })}
        disabled={busy}
        icon={<Trash2 />}
        onClick={discard}
        size="sm"
        variant="secondary"
      >
        {t("admin.deadLetters.discard.action")}
      </Button>
    </span>
  );
}

/**
 * The confirmation state of Replay and Discard: the pending row, the
 * action, and where the focus goes after it. The dialog returns the focus
 * to the button that opened it; when that row has left the list (a replayed
 * message is no longer open), the focus goes to `listRef` instead of
 * falling to the page.
 */
function useDeadLetterDialog(
  listRef: RefObject<HTMLElement | null>,
  items: readonly DeadLetter[] | undefined
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useAdminDeadLetterActions();
  const [pending, setPending] = useState<Pending | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  /** The row just acted on, once its action finished (`done`): see the effect. */
  const acted = useRef<{ done: boolean; id: string } | null>(null);
  const [settled, setSettled] = useState(0);

  // The focus once the refetched list is on screen: the dialog returned it
  // to the opener, which is gone when the row left the open list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` and `items` are the triggers.
  useEffect(() => {
    const row = acted.current;
    if (!row?.done) {
      return;
    }
    acted.current = null;
    const stillOpen = items?.some(
      (letter) => letter.id === row.id && letter.status === "open"
    );
    if (!(stillOpen || opener.current?.isConnected)) {
      listRef.current?.focus({ preventScroll: true });
    }
    opener.current = null;
  }, [items, listRef, settled]);

  const ask = useCallback((kind: Pending["kind"], letter: DeadLetter) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPending({ kind, letter });
  }, []);
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPending(null);
    }
  }, []);
  const settle = useCallback(
    (title: string, variant: "danger" | "success") => {
      toast({ title, variant });
      if (acted.current) {
        acted.current.done = true;
      }
      setSettled((count) => count + 1);
    },
    [toast]
  );
  const confirm = useCallback(() => {
    if (!pending) {
      return;
    }
    const { kind, letter } = pending;
    acted.current = { done: false, id: letter.id };
    const run =
      kind === "replay"
        ? actions.replay.mutateAsync({ id: letter.id })
        : actions.discard.mutateAsync({ id: letter.id });
    run
      .then(() =>
        settle(
          t(
            kind === "replay"
              ? "admin.deadLetters.replay.done"
              : "admin.deadLetters.discard.done"
          ),
          "success"
        )
      )
      .catch((error: unknown) => {
        console.error(`[admin] Failed to ${kind} ${letter.id}:`, error);
        settle(t(failureKey(error)), "danger");
      });
  }, [actions.discard, actions.replay, pending, settle, t]);

  return {
    ask,
    busy: actions.replay.isPending || actions.discard.isPending,
    confirm,
    onOpenChange,
    pending,
  };
}

/** The Replay / Discard confirmation. */
function ConfirmDialog({
  onConfirm,
  onOpenChange,
  pending,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pending: Pending | null;
}): ReactNode {
  const { t } = useTranslation();
  const kind = pending?.kind ?? "replay";
  // The consumer's `email:sent:<key>` marker lives 7 days: an older email
  // that was in fact delivered could be sent twice.
  const stale =
    pending?.kind === "replay" &&
    pending.letter.queue === "email" &&
    Date.now() - pending.letter.receivedAt > SENT_MARKER_MS;
  return (
    <AlertDialog
      body={
        stale ? (
          <Text size="body-sm" tone="muted">
            {t("admin.deadLetters.replay.old")}
          </Text>
        ) : undefined
      }
      confirmLabel={t(
        kind === "discard"
          ? "admin.deadLetters.discard.confirm"
          : "admin.deadLetters.replay.confirm"
      )}
      description={
        pending
          ? t(
              kind === "discard"
                ? "admin.deadLetters.discard.description"
                : "admin.deadLetters.replay.description",
              {
                queue: t(QUEUE_LABEL_KEYS[pending.letter.queue]),
                type: pending.letter.type,
              }
            )
          : undefined
      }
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={pending !== null}
      title={t(
        kind === "discard"
          ? "admin.deadLetters.discard.title"
          : "admin.deadLetters.replay.title"
      )}
      tone={kind === "discard" ? "danger" : "default"}
    />
  );
}

/** Newer and older page buttons. */
function Pager({
  nextCursor,
  onSearchChange,
  search,
}: DeadLetterTableProps & { nextCursor: string | null }): ReactNode {
  const { t } = useTranslation();
  const firstPage = useCallback(
    () => onSearchChange({ ...search, cursor: undefined }),
    [onSearchChange, search]
  );
  const olderPage = useCallback(() => {
    if (nextCursor) {
      onSearchChange({ ...search, cursor: nextCursor });
    }
  }, [nextCursor, onSearchChange, search]);
  if (!(search.cursor || nextCursor)) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {search.cursor ? (
        <Button icon={<ChevronsLeft />} onClick={firstPage} variant="secondary">
          {t("admin.deadLetters.firstPage")}
        </Button>
      ) : null}
      {nextCursor ? (
        <Button icon={<ChevronRight />} onClick={olderPage} variant="secondary">
          {t("admin.deadLetters.nextPage")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The dead letters (phase 9 task 4): a table with the status and queue
 * filters, keyset pages and, for an open row, Replay (when it can be) and
 * Discard, each behind a confirmation dialog. Nothing here ever shows a
 * stored body: the API does not return one.
 */
export function DeadLetterTable({
  onSearchChange,
  search,
}: DeadLetterTableProps): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const input = useMemo(() => listInput(search), [search]);
  const letters = useAdminDeadLetters(input);
  const listRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const { ask, busy, confirm, onOpenChange, pending } = useDeadLetterDialog(
    listRef,
    letters.data?.items
  );
  const { refetch } = letters;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the dead letters:", error);
    });
  }, [refetch]);

  const allColumns = useMemo<DataTableColumn<DeadLetter>[]>(
    () => [
      {
        cell: (letter) => (
          <time
            className="whitespace-nowrap tabular-nums"
            dateTime={new Date(letter.receivedAt).toISOString()}
          >
            {time(letter.receivedAt)}
          </time>
        ),
        header: t("admin.deadLetters.columns.received"),
        id: "received",
      },
      {
        cell: (letter) => t(QUEUE_LABEL_KEYS[letter.queue]),
        header: t("admin.deadLetters.columns.queue"),
        id: "queue",
      },
      {
        cell: (letter) => (
          <span className="flex min-w-0 flex-col gap-0.5">
            <code className="break-all text-body-sm">{letter.type}</code>
            {letter.status === "open" && !letter.replayable ? (
              <Text as="span" size="caption" tone="muted">
                {reasonText(t, letter)}
              </Text>
            ) : null}
          </span>
        ),
        header: t("admin.deadLetters.columns.type"),
        id: "type",
      },
      {
        align: "end",
        cell: (letter) => letter.attempts,
        header: t("admin.deadLetters.columns.attempts"),
        id: "attempts",
      },
      {
        cell: (letter) => (
          <Badge variant={STATUS_TONES[letter.status]}>
            {t(STATUS_LABEL_KEYS[letter.status])}
          </Badge>
        ),
        header: t("admin.deadLetters.columns.status"),
        id: "status",
      },
      {
        cell: (letter) => (
          <RowActions busy={busy} letter={letter} onAsk={ask} />
        ),
        header: t("admin.deadLetters.columns.actions"),
        id: "actions",
      },
    ],
    [ask, busy, t, time]
  );
  const visibility = useColumnVisibility(
    "dead-letters",
    allColumns,
    PINNED_COLUMNS
  );

  let body: ReactNode;
  if (letters.data) {
    body = (
      <div
        aria-busy={letters.isPlaceholderData}
        className={
          letters.isPlaceholderData
            ? "opacity-60 transition-opacity"
            : undefined
        }
      >
        <DataTable
          aria-labelledby={headingId}
          columns={visibility.columns}
          empty={t("admin.deadLetters.empty")}
          getRowId={letterId}
          rows={letters.data.items}
          stickyHeader
        />
      </div>
    );
  } else if (letters.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Filters onSearchChange={onSearchChange} search={search} />
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-3 outline-none"
        ref={listRef}
        tabIndex={-1}
      >
        <Heading className="sr-only" id={headingId} level={2}>
          {t("admin.deadLetters.title")}
        </Heading>
        <div className="flex justify-end">
          <ColumnsMenu
            all={allColumns}
            pinned={PINNED_COLUMNS}
            visibility={visibility}
          />
        </div>
        {body}
      </section>
      <Pager
        nextCursor={letters.data?.nextCursor ?? null}
        onSearchChange={onSearchChange}
        search={search}
      />
      <ConfirmDialog
        onConfirm={confirm}
        onOpenChange={onOpenChange}
        pending={pending}
      />
    </div>
  );
}
