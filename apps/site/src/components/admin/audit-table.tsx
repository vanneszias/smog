import { useAdminAudit, useAdminAuditActors } from "@smog/admin/client";
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditEntry,
  type AuditListInput,
  type AuditTargetType,
} from "@smog/admin/schema";
import { dayRange } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  DataTable,
  type DataTableColumn,
  ErrorState,
  Field,
  Input,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
} from "@smog/ui-web";
import { ChevronRight, ChevronsLeft, X } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  AuditActorName,
  AuditDetail,
  AuditTarget,
  actionLabel,
  targetTypeLabel,
  useAuditTime,
} from "./audit-data";

/**
 * The audit filters as they live in the URL (`/admin/audit?…`). The days
 * are Brussels calendar days, as the times in the table are shown.
 */
export interface AuditSearch {
  action?: AuditAction | undefined;
  actor?: string | undefined;
  /** The page's start (a cursor from the previous page). */
  cursor?: string | undefined;
  /** `YYYY-MM-DD`, inclusive, Brussels time. */
  from?: string | undefined;
  targetType?: AuditTargetType | undefined;
  /** `YYYY-MM-DD`, inclusive, Brussels time. */
  to?: string | undefined;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(
  value: unknown,
  values: readonly T[]
): T | undefined {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : undefined;
}

/**
 * Every key set (`undefined` when absent or invalid): the root route
 * validates no search, so an omitted key would keep the raw value.
 */
export function validateAuditSearch(
  search: Record<string, unknown>
): AuditSearch {
  const date = (value: unknown) =>
    typeof value === "string" && DATE.test(value) ? value : undefined;
  return {
    action: pick(search.action, AUDIT_ACTIONS),
    actor: text(search.actor, 200),
    cursor: text(search.cursor, 1024),
    from: date(search.from),
    targetType: pick(search.targetType, AUDIT_TARGET_TYPES),
    to: date(search.to),
  };
}

/** The list input for the URL's filters (a reversed day range is swapped). */
export function auditListInput(search: AuditSearch): AuditListInput {
  const reversed = Boolean(search.from && search.to && search.from > search.to);
  const [first, last] = reversed
    ? [search.to, search.from]
    : [search.from, search.to];
  return {
    action: search.action,
    actorId: search.actor,
    cursor: search.cursor,
    from: first ? dayRange(first)?.start : undefined,
    targetType: search.targetType,
    to: last ? dayRange(last)?.end : undefined,
  };
}

const ALL = "all";

function entryId(entry: AuditEntry): string {
  return entry.id;
}

export interface AuditTableProps {
  onSearchChange: (next: AuditSearch) => void;
  search: AuditSearch;
}

/** The filter row: action, target type, actor and a date range. */
function AuditFilters({ onSearchChange, search }: AuditTableProps): ReactNode {
  const { t } = useTranslation();
  const actors = useAdminAuditActors();
  const set = useCallback(
    (patch: Partial<AuditSearch>) =>
      onSearchChange({ ...search, ...patch, cursor: undefined }),
    [onSearchChange, search]
  );
  const all = { label: t("admin.audit.filters.all"), value: ALL };
  const onAction = useCallback(
    (value: string) => set({ action: pick(value, AUDIT_ACTIONS) }),
    [set]
  );
  const onTargetType = useCallback(
    (value: string) => set({ targetType: pick(value, AUDIT_TARGET_TYPES) }),
    [set]
  );
  const onActor = useCallback(
    (value: string) => set({ actor: value === ALL ? undefined : value }),
    [set]
  );
  const onFrom = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      set({ from: event.target.value || undefined }),
    [set]
  );
  const onTo = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      set({ to: event.target.value || undefined }),
    [set]
  );
  const clear = useCallback(() => onSearchChange({}), [onSearchChange]);
  const filtered =
    search.action ||
    search.targetType ||
    search.actor ||
    search.from ||
    search.to;
  return (
    <fieldset className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      <legend className="sr-only">{t("admin.audit.filters.label")}</legend>
      <Field
        className="col-span-2 sm:col-span-1 lg:col-span-1"
        label={t("admin.audit.filters.action")}
      >
        <Select
          onValueChange={onAction}
          options={[
            all,
            ...AUDIT_ACTIONS.map((action) => ({
              label: actionLabel(t, action),
              value: action,
            })),
          ]}
          value={search.action ?? ALL}
        />
      </Field>
      <Field
        className="col-span-2 sm:col-span-1 lg:col-span-1"
        label={t("admin.audit.filters.targetType")}
      >
        <Select
          onValueChange={onTargetType}
          options={[
            all,
            ...AUDIT_TARGET_TYPES.map((type) => ({
              label: targetTypeLabel(t, type),
              value: type,
            })),
          ]}
          value={search.targetType ?? ALL}
        />
      </Field>
      <Field
        className="col-span-2 sm:col-span-1 lg:col-span-1"
        label={t("admin.audit.filters.actor")}
      >
        <Select
          onValueChange={onActor}
          options={[
            all,
            ...(actors.data?.actors ?? []).map((actor) => ({
              label: actor.name,
              value: actor.id,
            })),
          ]}
          value={search.actor ?? ALL}
        />
      </Field>
      <Field label={t("admin.audit.filters.from")}>
        <Input onChange={onFrom} type="date" value={search.from ?? ""} />
      </Field>
      <Field label={t("admin.audit.filters.to")}>
        <Input onChange={onTo} type="date" value={search.to ?? ""} />
      </Field>
      <Button
        className="col-span-2 justify-self-start sm:col-span-1 lg:col-span-1"
        disabled={!filtered}
        icon={<X />}
        onClick={clear}
        variant="ghost"
      >
        {t("admin.audit.filters.clear")}
      </Button>
    </fieldset>
  );
}

/**
 * Audit entries as a dense table; a row opens a side sheet with the whole
 * entry (the audit page and the dashboard's recent actions).
 */
export function AuditEntries({
  entries,
  label,
}: {
  entries: readonly AuditEntry[];
  label: string;
}): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const columns = useMemo<DataTableColumn<AuditEntry>[]>(
    () => [
      {
        cell: (entry) => (
          <time
            className="whitespace-nowrap tabular-nums"
            dateTime={new Date(entry.createdAt).toISOString()}
          >
            {time(entry.createdAt)}
          </time>
        ),
        header: t("admin.audit.columns.when"),
        id: "when",
      },
      {
        cell: (entry) => actionLabel(t, entry.action),
        header: t("admin.audit.columns.action"),
        id: "action",
      },
      {
        cell: (entry) => <AuditTarget entry={entry} />,
        header: t("admin.audit.columns.target"),
        id: "target",
      },
      {
        cell: (entry) => <AuditActorName actor={entry.actor} />,
        header: t("admin.audit.columns.actor"),
        id: "actor",
      },
    ],
    [t, time]
  );
  const closeDetail = useCallback((open: boolean) => {
    if (!open) {
      setSelected(null);
    }
  }, []);
  return (
    <>
      <DataTable
        aria-label={label}
        columns={columns}
        empty={t("admin.audit.empty")}
        getRowId={entryId}
        onRowClick={setSelected}
        rows={entries}
        stickyHeader
      />
      <Sheet onOpenChange={closeDetail} open={selected !== null}>
        {selected ? (
          <SheetContent side="right" title={actionLabel(t, selected.action)}>
            <AuditDetail entry={selected} />
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * `/admin/audit` (A-24): the audit log as a table with URL filters and
 * keyset pages.
 */
export function AuditTable({
  onSearchChange,
  search,
}: AuditTableProps): ReactNode {
  const { t } = useTranslation();
  const input = useMemo(() => auditListInput(search), [search]);
  const audit = useAdminAudit(input);
  const nextCursor = audit.data?.nextCursor ?? null;
  const { refetch } = audit;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the audit log:", error);
    });
  }, [refetch]);
  const firstPage = useCallback(
    () => onSearchChange({ ...search, cursor: undefined }),
    [onSearchChange, search]
  );
  const olderPage = useCallback(() => {
    if (nextCursor) {
      onSearchChange({ ...search, cursor: nextCursor });
    }
  }, [nextCursor, onSearchChange, search]);

  let body: ReactNode;
  if (audit.data) {
    // The previous filter's rows stay while the new page loads: dimmed.
    body = (
      <div
        aria-busy={audit.isPlaceholderData}
        className={
          audit.isPlaceholderData ? "opacity-60 transition-opacity" : undefined
        }
      >
        <AuditEntries
          entries={audit.data.items}
          label={t("admin.audit.title")}
        />
      </div>
    );
  } else if (audit.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <AuditFilters onSearchChange={onSearchChange} search={search} />
      {body}
      {search.cursor || nextCursor ? (
        <div className="flex flex-wrap justify-end gap-2">
          {search.cursor ? (
            <Button
              icon={<ChevronsLeft />}
              onClick={firstPage}
              variant="secondary"
            >
              {t("admin.audit.firstPage")}
            </Button>
          ) : null}
          {nextCursor ? (
            <Button
              icon={<ChevronRight />}
              onClick={olderPage}
              variant="secondary"
            >
              {t("admin.audit.nextPage")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
