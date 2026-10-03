import { useAdminSponsorships } from "@smog/admin/client";
import {
  type AdminSponsorshipRow,
  SPONSORSHIP_QUERY_MAX,
} from "@smog/admin/schema";
import { SPONSORSHIP_STATUSES, type SponsorshipStatus } from "@smog/db/enums";
import { useTranslation } from "@smog/i18n/react";
import { SPONSORSHIP_STATUS_LABEL_KEYS } from "@smog/sponsorships/schema";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  SearchField,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@smog/ui-web";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, ChevronsLeft, FileText, SearchX, X } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PAYMENT_STATUS_TONES,
  paymentStatusLabel,
  useDay,
  useMoney,
} from "./labels";
import { ModerationQueue } from "./moderation-queue";
import {
  SPONSORSHIP_TABS,
  type SponsorshipSearch,
  type SponsorshipTab,
  sharedListInput,
  sponsorshipListInput,
  TAB_LABEL_KEYS,
  tabCount,
} from "./search";
import { StatusBadge } from "./status-badge";

const ALL = "all";
/** How long the search waits after the last keystroke before it filters. */
const SEARCH_DEBOUNCE_MS = 300;

function pickStatus(value: string): SponsorshipStatus | undefined {
  return SPONSORSHIP_STATUSES.find((status) => status === value);
}

export interface SponsorshipTableProps {
  onSearchChange: (next: SponsorshipSearch) => void;
  search: SponsorshipSearch;
}

/** The filter row: a search (debounced into the URL), the status, the days. */
function SponsorshipFilters({
  onSearchChange,
  search,
}: SponsorshipTableProps): ReactNode {
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.q ?? "");
  const set = useCallback(
    (patch: Partial<SponsorshipSearch>) =>
      onSearchChange({ ...search, ...patch, cursor: undefined }),
    [onSearchChange, search]
  );

  // The text this field last put in the URL: only another change (back,
  // a link) replaces what is being typed.
  const pushed = useRef(search.q);
  useEffect(() => {
    if (search.q !== pushed.current) {
      pushed.current = search.q;
      setQuery(search.q ?? "");
    }
  }, [search.q]);

  useEffect(() => {
    const next = query.trim() ? query : undefined;
    if (next === search.q) {
      return;
    }
    const timer = setTimeout(() => {
      pushed.current = next;
      set({ q: next });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search.q, set]);

  // A status narrows the All tab: choosing one moves there.
  const onStatus = useCallback(
    (value: string) => {
      const status = pickStatus(value);
      set(status ? { status, tab: "all" } : { status: undefined });
    },
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
  const clear = useCallback(() => {
    pushed.current = undefined;
    setQuery("");
    onSearchChange({ tab: search.tab });
  }, [onSearchChange, search.tab]);
  const removePayment = useCallback(() => set({ payment: undefined }), [set]);
  const paymentLabel = search.payment
    ? t("admin.sponsorships.filters.payment", { id: search.payment })
    : "";
  const onAllTab = search.tab === "all";
  const filtered = Boolean(
    search.q ||
      search.from ||
      search.to ||
      search.payment ||
      (onAllTab && search.status)
  );

  return (
    <fieldset className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
      <legend className="sr-only">
        {t("admin.sponsorships.filters.label")}
      </legend>
      <div className="col-span-2 lg:col-span-1">
        <SearchField
          aria-label={t("admin.sponsorships.filters.search")}
          maxLength={SPONSORSHIP_QUERY_MAX}
          onValueChange={setQuery}
          placeholder={t("admin.sponsorships.filters.search")}
          value={query}
        />
      </div>
      <Field
        className="col-span-2 sm:col-span-1 lg:col-span-1"
        label={t("admin.sponsorships.filters.status")}
      >
        <Select
          onValueChange={onStatus}
          options={[
            { label: t("admin.sponsorships.filters.all"), value: ALL },
            ...SPONSORSHIP_STATUSES.map((status) => ({
              label: t(SPONSORSHIP_STATUS_LABEL_KEYS[status]),
              value: status,
            })),
          ]}
          value={(onAllTab && search.status) || ALL}
        />
      </Field>
      <Field label={t("admin.sponsorships.filters.from")}>
        <Input onChange={onFrom} type="date" value={search.from ?? ""} />
      </Field>
      <Field label={t("admin.sponsorships.filters.to")}>
        <Input onChange={onTo} type="date" value={search.to ?? ""} />
      </Field>
      <Button
        className="col-span-2 justify-self-start sm:col-span-1 lg:col-span-1"
        disabled={!filtered}
        icon={<X />}
        onClick={clear}
        variant="ghost"
      >
        {t("admin.sponsorships.filters.clear")}
      </Button>
      {search.payment ? (
        // The audit log's payment link narrows the list to one payment:
        // shown, so the narrowing is never invisible (review M6).
        <div className="col-span-2 flex lg:col-span-5">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-surface-sunken py-0.5 pr-1 pl-3 text-body-sm">
            <span className="truncate">{paymentLabel}</span>
            <IconButton
              icon={<X />}
              label={t("admin.sponsorships.filters.remove", {
                label: paymentLabel,
              })}
              onClick={removePayment}
              size="sm"
            />
          </span>
        </div>
      ) : null}
    </fieldset>
  );
}

function rowId(row: AdminSponsorshipRow): string {
  return row.id;
}

/** The sponsorships as a dense table; a row opens the detail. */
function SponsorshipRows({
  rows,
}: {
  rows: readonly AdminSponsorshipRow[];
}): ReactNode {
  const { t } = useTranslation();
  const day = useDay();
  const money = useMoney();
  const navigate = useNavigate();
  const open = useCallback(
    (row: AdminSponsorshipRow) => {
      navigate({
        params: { id: row.id },
        to: "/admin/sponsorships/$id",
      }).catch((error: unknown) => {
        console.error("[admin] Failed to open the sponsorship:", error);
      });
    },
    [navigate]
  );
  const columns = useMemo<DataTableColumn<AdminSponsorshipRow>[]>(
    () => [
      {
        cell: (row) => (
          <span className="flex min-w-0 max-w-[14rem] flex-col sm:max-w-[22rem] lg:max-w-none">
            <span className="truncate font-medium">{row.gesture.name}</span>
            <Text as="span" className="truncate" size="caption" tone="muted">
              {row.displayName}
            </Text>
          </span>
        ),
        header: t("admin.sponsorships.columns.gesture"),
        id: "gesture",
      },
      {
        cell: (row) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.status} />
            {row.refundNeeded ? (
              <Badge variant="danger">
                {t("admin.sponsorships.refundNeededBadge")}
              </Badge>
            ) : null}
          </span>
        ),
        header: t("admin.sponsorships.columns.status"),
        id: "status",
      },
      {
        cell: (row) => (
          <span className="flex min-w-0 max-w-[16rem] flex-col">
            <span className="truncate">{row.sponsor.name}</span>
            <Text as="span" className="truncate" size="caption" tone="muted">
              {row.sponsor.email}
            </Text>
          </span>
        ),
        header: t("admin.sponsorships.columns.sponsor"),
        id: "sponsor",
      },
      {
        cell: (row) => (
          <span className="flex flex-col items-start gap-1">
            <span className="whitespace-nowrap tabular-nums">
              {row.amountCents === null ? "—" : money(row.amountCents)}
            </span>
            {row.paymentStatus ? (
              <Badge variant={PAYMENT_STATUS_TONES[row.paymentStatus]}>
                {paymentStatusLabel(t, row.paymentStatus)}
              </Badge>
            ) : null}
          </span>
        ),
        header: t("admin.sponsorships.columns.payment"),
        id: "payment",
      },
      {
        cell: (row) =>
          row.invoiceRequested ? (
            <Badge icon={<FileText />} variant="warning">
              {t("admin.sponsorships.invoice.short")}
            </Badge>
          ) : (
            <span aria-hidden="true">—</span>
          ),
        header: t("admin.sponsorships.columns.invoice"),
        id: "invoice",
      },
      {
        cell: (row) => (
          <time
            className="whitespace-nowrap tabular-nums"
            dateTime={new Date(row.createdAt).toISOString()}
          >
            {day(row.createdAt)}
          </time>
        ),
        header: t("admin.sponsorships.columns.created"),
        id: "created",
      },
    ],
    [day, money, t]
  );
  if (rows.length === 0) {
    // No empty table: on a phone it scrolls sideways with nothing to focus.
    return (
      <EmptyState
        description={t("admin.sponsorships.emptyDescription")}
        icon={<SearchX />}
        level={2}
        title={t("admin.sponsorships.empty")}
      />
    );
  }
  return (
    <DataTable
      aria-label={t("admin.sponsorships.title")}
      columns={columns}
      empty={t("admin.sponsorships.empty")}
      getRowId={rowId}
      onRowClick={open}
      rows={rows}
      stickyHeader
    />
  );
}

/**
 * `/admin/sponsorships` (A-04, A-08): the tabs with their counts, the
 * filters in the URL, and a keyset page at a time. The Review tab is the
 * moderation queue's cards; every other tab is a table.
 */
export function SponsorshipTable({
  onSearchChange,
  search,
}: SponsorshipTableProps): ReactNode {
  const { t } = useTranslation();
  const tab = search.tab ?? "review";
  const input = useMemo(() => sponsorshipListInput(search), [search]);
  const list = useAdminSponsorships(input);
  // The counts of the tabs: the status tabs share one answer (counts
  // ignore the status); the refund tab counts its own filter.
  const shared = useMemo(() => {
    const { cursor: _cursor, ...rest } = sharedListInput(search);
    return rest;
  }, [search]);
  const statusCounts = useAdminSponsorships({ ...shared, limit: 1 });
  const refundCounts = useAdminSponsorships({
    ...shared,
    limit: 1,
    refundNeeded: true,
  });
  const counts = statusCounts.data?.counts;
  const refundTotal = refundCounts.data
    ? Object.values(refundCounts.data.counts).reduce((a, b) => a + b, 0)
    : 0;

  // On a phone the strip scrolls: the active tab (a link to `?tab=refund`)
  // is brought into view.
  const tabList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Radix names each trigger `<base>-trigger-<value>`.
    const active = tabList.current?.querySelector<HTMLElement>(
      `[role="tab"][id$="-trigger-${tab}"]`
    );
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab]);

  const nextCursor = list.data?.nextCursor ?? null;
  const { refetch } = list;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the sponsorships:", error);
    });
  }, [refetch]);
  const onTab = useCallback(
    (value: string) => {
      const next = SPONSORSHIP_TABS.find((entry) => entry === value);
      onSearchChange({
        ...search,
        cursor: undefined,
        status: undefined,
        tab: next === "review" ? undefined : next,
      });
    },
    [onSearchChange, search]
  );
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
  if (list.data) {
    // The previous filter's rows stay while the new page loads: dimmed.
    body = (
      <div
        aria-busy={list.isPlaceholderData}
        className={
          list.isPlaceholderData ? "opacity-60 transition-opacity" : undefined
        }
      >
        {tab === "review" ? (
          <ModerationQueue rows={list.data.items} />
        ) : (
          <SponsorshipRows rows={list.data.items} />
        )}
      </div>
    );
  } else if (list.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <SponsorshipFilters onSearchChange={onSearchChange} search={search} />
      <Tabs onValueChange={onTab} value={tab}>
        <TabsList
          aria-label={t("admin.sponsorships.tabs.label")}
          // From lg every tab is visible: the strip wraps instead of
          // hiding the last ones (review M4); below it scrolls.
          className="lg:flex-wrap lg:overflow-visible"
          ref={tabList}
        >
          {SPONSORSHIP_TABS.map((entry: SponsorshipTab) => {
            const count =
              counts === undefined
                ? null
                : tabCount(entry, counts, refundTotal);
            return (
              <TabsTrigger key={entry} value={entry}>
                {t(TAB_LABEL_KEYS[entry])}
                {count === null ? null : (
                  <Badge
                    variant={
                      count > 0 && (entry === "review" || entry === "refund")
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {SPONSORSHIP_TABS.map((entry) => (
          <TabsContent
            className="flex flex-col gap-4"
            key={entry}
            value={entry}
          >
            {entry === tab ? body : null}
          </TabsContent>
        ))}
      </Tabs>
      {search.cursor || nextCursor ? (
        <div className="flex flex-wrap justify-end gap-2">
          {search.cursor ? (
            <Button
              icon={<ChevronsLeft />}
              onClick={firstPage}
              variant="secondary"
            >
              {t("admin.sponsorships.firstPage")}
            </Button>
          ) : null}
          {nextCursor ? (
            <Button
              icon={<ChevronRight />}
              onClick={olderPage}
              variant="secondary"
            >
              {t("admin.sponsorships.nextPage")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
