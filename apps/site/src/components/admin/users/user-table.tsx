import { useAdminUsers } from "@smog/admin/client";
import {
  type AdminRole,
  type AdminUser,
  type AdminUserListInput,
  USER_QUERY_MAX,
} from "@smog/admin/schema";
import {
  DEFAULT_LOCALE,
  formatDate,
  isLocale,
  type Translate,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  ErrorState,
  Field,
  SearchField,
  Select,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { ChevronRight, ChevronsLeft, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ROLES = ["user", "admin"] as const satisfies readonly AdminRole[];
const BANNED = ["yes", "no"] as const;
type BannedFilter = (typeof BANNED)[number];

/** The users filters as they live in the URL (`/admin/users?…`). */
export interface UserSearch {
  banned?: BannedFilter | undefined;
  /** The page's start (a cursor from the previous page). */
  cursor?: string | undefined;
  q?: string | undefined;
  role?: AdminRole | undefined;
  /** The account whose panel is open (also the audit log's link). */
  user?: string | undefined;
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

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
    ? value
    : undefined;
}

/**
 * Every key set (`undefined` when absent or invalid): the root route
 * validates no search, so an omitted key would keep the raw value.
 */
export function validateUserSearch(
  search: Record<string, unknown>
): UserSearch {
  return {
    banned: pick(search.banned, BANNED),
    cursor: text(search.cursor, 1024),
    q: text(search.q, USER_QUERY_MAX),
    role: pick(search.role, ROLES),
    user: text(search.user, 200),
  };
}

/** The list input for the URL's filters. */
export function userListInput(search: UserSearch): AdminUserListInput {
  return {
    banned: search.banned === undefined ? undefined : search.banned === "yes",
    cursor: search.cursor,
    q: search.q?.trim() || undefined,
    role: search.role,
  };
}

const ALL = "all";
/** How long the search waits after the last keystroke before it filters. */
const SEARCH_DEBOUNCE_MS = 300;

export function roleLabel(t: Translate, role: AdminRole): string {
  return t(`admin.users.roles.${role}`);
}

/** A day in the page's language (Brussels time). */
export function useUserDate(): (ms: number) => string {
  const { i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  return useCallback(
    (ms: number) => formatDate(ms, locale, { dateStyle: "medium" }),
    [locale]
  );
}

/** The role as a badge (admins stand out). */
export function RoleBadge({ role }: { role: AdminRole }): ReactNode {
  const { t } = useTranslation();
  return (
    <Badge variant={role === "admin" ? "primary" : "neutral"}>
      {roleLabel(t, role)}
    </Badge>
  );
}

/** Banned, unconfirmed or active. */
export function StatusBadge({
  user,
}: {
  user: Pick<AdminUser, "banned" | "emailVerified">;
}): ReactNode {
  const { t } = useTranslation();
  if (user.banned) {
    return <Badge variant="danger">{t("admin.users.status.banned")}</Badge>;
  }
  if (!user.emailVerified) {
    return (
      <Badge variant="warning">{t("admin.users.status.unverified")}</Badge>
    );
  }
  return <Badge variant="success">{t("admin.users.status.active")}</Badge>;
}

export interface UserTableProps {
  /** The signed-in admin (their row says "You"). */
  actorId: string;
  onSearchChange: (next: UserSearch) => void;
  search: UserSearch;
}

/** The filter row: a search (debounced into the URL), the role and the ban. */
function UserFilters({
  onSearchChange,
  search,
}: Omit<UserTableProps, "actorId">): ReactNode {
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.q ?? "");
  const set = useCallback(
    (patch: Partial<UserSearch>) =>
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

  const all = { label: t("admin.users.filters.all"), value: ALL };
  const onRole = useCallback(
    (value: string) => set({ role: pick(value, ROLES) }),
    [set]
  );
  const onBanned = useCallback(
    (value: string) => set({ banned: pick(value, BANNED) }),
    [set]
  );
  const clear = useCallback(() => {
    pushed.current = undefined;
    setQuery("");
    onSearchChange({ user: search.user });
  }, [onSearchChange, search.user]);
  const filtered = Boolean(search.q || search.role || search.banned);

  return (
    <fieldset className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]">
      <legend className="sr-only">{t("admin.users.filters.label")}</legend>
      <div className="col-span-2 lg:col-span-1">
        <SearchField
          aria-label={t("admin.users.filters.search")}
          maxLength={USER_QUERY_MAX}
          onValueChange={setQuery}
          placeholder={t("admin.users.filters.search")}
          value={query}
        />
      </div>
      <Field label={t("admin.users.filters.role")}>
        <Select
          onValueChange={onRole}
          options={[
            all,
            ...ROLES.map((role) => ({
              label: roleLabel(t, role),
              value: role,
            })),
          ]}
          value={search.role ?? ALL}
        />
      </Field>
      <Field label={t("admin.users.filters.status")}>
        <Select
          onValueChange={onBanned}
          options={[
            all,
            { label: t("admin.users.filters.banned"), value: "yes" },
            { label: t("admin.users.filters.notBanned"), value: "no" },
          ]}
          value={search.banned ?? ALL}
        />
      </Field>
      <Button
        className="col-span-2 justify-self-start lg:col-span-1"
        disabled={!filtered}
        icon={<X />}
        onClick={clear}
        variant="ghost"
      >
        {t("admin.users.filters.clear")}
      </Button>
    </fieldset>
  );
}

function userId(row: AdminUser): string {
  return row.id;
}

/**
 * `/admin/users` (A-23): accounts newest first, filtered in the URL, a
 * keyset page at a time. A row opens the user panel (`?user=`).
 */
export function UserTable({
  actorId,
  onSearchChange,
  search,
}: UserTableProps): ReactNode {
  const { t } = useTranslation();
  const date = useUserDate();
  const input = useMemo(() => userListInput(search), [search]);
  const users = useAdminUsers(input);
  const nextCursor = users.data?.nextCursor ?? null;
  const { refetch } = users;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the users:", error);
    });
  }, [refetch]);
  const open = useCallback(
    (row: AdminUser) => onSearchChange({ ...search, user: row.id }),
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

  const columns = useMemo<DataTableColumn<AdminUser>[]>(
    () => [
      {
        cell: (row) => (
          // Long emails are cut on narrow screens; the panel shows them whole.
          <span className="flex min-w-0 max-w-[14rem] flex-col sm:max-w-[24rem] lg:max-w-none">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <span className="truncate">{row.name || row.email}</span>
              {row.id === actorId ? (
                <Badge variant="accent">{t("admin.users.you")}</Badge>
              ) : null}
            </span>
            {row.name ? (
              <Text as="span" className="truncate" size="caption" tone="muted">
                {row.email}
              </Text>
            ) : null}
          </span>
        ),
        header: t("admin.users.columns.name"),
        id: "name",
      },
      {
        cell: (row) => <RoleBadge role={row.role} />,
        header: t("admin.users.columns.role"),
        id: "role",
      },
      {
        cell: (row) => <StatusBadge user={row} />,
        header: t("admin.users.columns.status"),
        id: "status",
      },
      {
        cell: (row) => (
          <time
            className="whitespace-nowrap tabular-nums"
            dateTime={new Date(row.createdAt).toISOString()}
          >
            {date(row.createdAt)}
          </time>
        ),
        header: t("admin.users.columns.created"),
        id: "created",
      },
    ],
    [actorId, date, t]
  );

  let body: ReactNode;
  if (users.data) {
    // The previous filter's rows stay while the new page loads: dimmed.
    body = (
      <div
        aria-busy={users.isPlaceholderData}
        className={
          users.isPlaceholderData ? "opacity-60 transition-opacity" : undefined
        }
      >
        <DataTable
          aria-label={t("admin.users.title")}
          columns={columns}
          empty={t("admin.users.empty")}
          getRowId={userId}
          onRowClick={open}
          rows={users.data.items}
          stickyHeader
        />
      </div>
    );
  } else if (users.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <UserFilters onSearchChange={onSearchChange} search={search} />
      {body}
      {search.cursor || nextCursor ? (
        <div className="flex flex-wrap justify-end gap-2">
          {search.cursor ? (
            <Button
              icon={<ChevronsLeft />}
              onClick={firstPage}
              variant="secondary"
            >
              {t("admin.users.firstPage")}
            </Button>
          ) : null}
          {nextCursor ? (
            <Button
              icon={<ChevronRight />}
              onClick={olderPage}
              variant="secondary"
            >
              {t("admin.users.nextPage")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
