import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  type DataTableColumn,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@smog/ui-web";
import { Check, Columns3, Ellipsis, ExternalLink } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The shadcn data-table pattern's two missing parts (sort and the row click
 * are `DataTable`'s, filters and keyset paging are each screen's): a column
 * visibility menu and a row actions menu.
 */

const STORAGE_PREFIX = "smog.admin.columns.";

function readHidden(key: string): readonly string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeHidden(key: string, hidden: ReadonlySet<string>): void {
  try {
    if (hidden.size === 0) {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } else {
      window.localStorage.setItem(
        STORAGE_PREFIX + key,
        JSON.stringify([...hidden])
      );
    }
  } catch {
    // Private mode or blocked storage: the choice lasts until the reload.
  }
}

export interface ColumnVisibility<Row> {
  /** The columns the table shows. */
  columns: readonly DataTableColumn<Row>[];
  /** Ids the person hid. */
  hidden: ReadonlySet<string>;
  reset: () => void;
  toggle: (id: string) => void;
}

/**
 * Which columns of a table are shown. The choice is per table (`key`) and per
 * browser, read after hydration (the server and the first render show every
 * column). `pinned` ids (the name, the actions) cannot be hidden.
 */
export function useColumnVisibility<Row>(
  key: string,
  columns: readonly DataTableColumn<Row>[],
  pinned: readonly string[]
): ColumnVisibility<Row> {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setHidden(new Set(readHidden(key)));
  }, [key]);
  const toggle = useCallback(
    (id: string) => {
      if (pinned.includes(id)) {
        return;
      }
      setHidden((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        writeHidden(key, next);
        return next;
      });
    },
    [key, pinned]
  );
  const reset = useCallback(() => {
    setHidden(new Set());
    writeHidden(key, new Set());
  }, [key]);
  const shown = useMemo(
    () => columns.filter((column) => !hidden.has(column.id)),
    [columns, hidden]
  );
  return { columns: shown, hidden, reset, toggle };
}

function columnName<Row>(column: DataTableColumn<Row>): string {
  return typeof column.header === "string" ? column.header : column.id;
}

function ColumnItem({
  id,
  name,
  onToggle,
  shown,
}: {
  id: string;
  name: string;
  onToggle: (id: string) => void;
  shown: boolean;
}): ReactNode {
  const select = useCallback(
    (event: Event) => {
      // Stay open: several columns are toggled in one visit.
      event.preventDefault();
      onToggle(id);
    },
    [id, onToggle]
  );
  return (
    <MenuItem
      aria-checked={shown}
      icon={shown ? <Check /> : <span className="size-5" />}
      onSelect={select}
      role="menuitemcheckbox"
    >
      {name}
    </MenuItem>
  );
}

export interface ColumnsMenuProps<Row> {
  /** Every column of the table (also the hidden ones). */
  all: readonly DataTableColumn<Row>[];
  pinned: readonly string[];
  visibility: ColumnVisibility<Row>;
}

/** "Columns": a checkbox list over the table's hideable columns. */
export function ColumnsMenu<Row>({
  all,
  pinned,
  visibility,
}: ColumnsMenuProps<Row>): ReactNode {
  const { t } = useTranslation();
  const choices = all.filter(
    (column) => !pinned.includes(column.id) && typeof column.header === "string"
  );
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button icon={<Columns3 />} variant="secondary">
          {t("admin.table.columns")}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>{t("admin.table.columnsLabel")}</MenuLabel>
        {choices.map((column) => {
          const shown = !visibility.hidden.has(column.id);
          return (
            <ColumnItem
              id={column.id}
              key={column.id}
              name={columnName(column)}
              onToggle={visibility.toggle}
              shown={shown}
            />
          );
        })}
        <MenuSeparator />
        <MenuItem
          disabled={visibility.hidden.size === 0}
          onSelect={visibility.reset}
        >
          {t("admin.table.showAll")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export interface RowActionsProps<Row> {
  /** The row's name, for the button's accessible name. */
  name: string;
  /** Opens the row (as a click on it does). */
  onOpen: (row: Row) => void;
  row: Row;
}

/**
 * The row's "..." menu with "Open". A row click is a mouse shortcut; this is
 * the visible, keyboard-reachable way in (the click does not bubble to the
 * row).
 */
export function RowActions<Row>({
  name,
  onOpen,
  row,
}: RowActionsProps<Row>): ReactNode {
  const { t } = useTranslation();
  const open = useCallback(() => onOpen(row), [onOpen, row]);
  const stop = useCallback(
    (event: MouseEvent | KeyboardEvent) => event.stopPropagation(),
    []
  );
  return (
    // Clicks and keys in the menu (it is a portal, but React bubbles through
    // it) must not reach the row's own open handler.
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
            label={t("admin.table.rowActions", { name })}
          />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<ExternalLink />} onSelect={open}>
            {t("admin.table.open")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </span>
  );
}
