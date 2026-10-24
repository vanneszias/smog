import { LESSON_TITLE_MAX } from "@smog/db/enums";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import type {
  LessonItem,
  LessonSection,
  TeacherCoverageState,
} from "@smog/lessons/schema";
import {
  Badge,
  Button,
  GestureRow,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Text,
} from "@smog/ui-web";
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  EyeOff,
  FolderInput,
  ImageIcon,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  type ReorderEvent,
  type ReorderPosition,
  SortableList,
  type SortableRowArgs,
} from "@/components/sortable-list";
import type { LessonDraft, SectionRef } from "./lesson-draft";

/** What the structure's rows need from the builder (so the rows take only their own data). */
export interface StructureValue {
  /** The language the section titles and the readiness show (the active tab). */
  activeLocale: string;
  /** The default language's code: its section title is the placeholder of an untitled one. */
  defaultLocale: string;
  draft: LessonDraft;
  onMoveItem: (gestureId: string, to: SectionRef) => void;
  onRemoveItem: (gestureId: string) => void;
  onRemoveSection: (id: string) => void;
  onRenameSection: (id: string, title: string) => void;
  onReorderItems: (within: SectionRef, ids: readonly string[]) => Promise<void>;
  onReorderSections: (ids: readonly string[]) => Promise<void>;
  /** Teacher-info state per gesture in `activeLocale` (absent until the readiness loaded). */
  readiness: ReadonlyMap<string, TeacherCoverageState>;
  readOnly: boolean;
}

const StructureContext = createContext<StructureValue | null>(null);

export function StructureProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: StructureValue;
}): ReactNode {
  return (
    <StructureContext.Provider value={value}>
      {children}
    </StructureContext.Provider>
  );
}

function useStructure(): StructureValue {
  const value = useContext(StructureContext);
  if (!value) {
    throw new Error("[lessons] The structure needs its provider");
  }
  return value;
}

const REORDER_KEYS = {
  cancelled: "admin.lessons.reorder.cancelled",
  dropped: "admin.lessons.reorder.dropped",
  moved: "admin.lessons.reorder.moved",
  picked: "admin.lessons.reorder.picked",
} as const satisfies Record<ReorderEvent, TranslationKey>;

function useAnnounce(): (
  event: ReorderEvent,
  position: ReorderPosition
) => string {
  const { t } = useTranslation();
  return useCallback(
    (event, position) => t(REORDER_KEYS[event], { ...position }),
    [t]
  );
}

const READINESS_LABELS = {
  fallback: "admin.lessons.item.readiness.fallback",
  none: "admin.lessons.item.readiness.none",
  own: "admin.lessons.item.readiness.own",
} as const satisfies Record<TeacherCoverageState, TranslationKey>;

const READINESS_VARIANTS = {
  fallback: "warning",
  none: "neutral",
  own: "success",
} as const satisfies Record<
  TeacherCoverageState,
  "neutral" | "success" | "warning"
>;

/** A section's name for menus and announcements: its title in the active language, else the default's, else "Section N". */
export function sectionName(
  section: LessonSection,
  index: number,
  active: string,
  fallback: string,
  untitled: (n: number) => string
): string {
  return (
    section.titles[active] ||
    section.titles[fallback] ||
    Object.values(section.titles)[0] ||
    untitled(index + 1)
  );
}

function ItemBadges({ item }: { item: LessonItem }): ReactNode {
  const { t } = useTranslation();
  const { readiness } = useStructure();
  const state = item.published ? readiness.get(item.id) : undefined;
  if (item.published && !item.hasDrawing && !state) {
    return null;
  }
  return (
    <span className="flex flex-wrap items-center gap-1 ps-2 pb-1">
      {item.published ? null : (
        <Badge icon={<EyeOff />} variant="warning">
          {t("admin.lessons.item.unpublished")}
        </Badge>
      )}
      {item.hasDrawing ? (
        <Badge icon={<ImageIcon />} variant="neutral">
          {t("admin.lessons.item.drawing")}
        </Badge>
      ) : null}
      {state ? (
        <Badge variant={READINESS_VARIANTS[state]}>
          {t(READINESS_LABELS[state])}
        </Badge>
      ) : null}
    </span>
  );
}

function MoveToItem({
  gestureId,
  label,
  onMove,
  to,
}: {
  gestureId: string;
  label: string;
  onMove: (gestureId: string, to: SectionRef) => void;
  to: SectionRef;
}): ReactNode {
  const move = useCallback(
    () => onMove(gestureId, to),
    [gestureId, onMove, to]
  );
  return (
    <MenuItem icon={<FolderInput />} onSelect={move}>
      {label}
    </MenuItem>
  );
}

function ItemMenu({
  moveDown,
  moveUp,
  item,
  within,
}: {
  item: LessonItem;
  moveDown: (() => void) | null;
  moveUp: (() => void) | null;
  within: SectionRef;
}): ReactNode {
  const { t } = useTranslation();
  const { activeLocale, defaultLocale, draft, onMoveItem, onRemoveItem } =
    useStructure();
  const remove = useCallback(
    () => onRemoveItem(item.id),
    [item.id, onRemoveItem]
  );
  const untitled = useCallback(
    (n: number) => t("admin.lessons.section.untitled", { number: n }),
    [t]
  );
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          icon={<Ellipsis />}
          label={t("admin.lessons.item.actions", { name: item.name })}
        />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem
          disabled={!moveUp}
          icon={<ArrowUp />}
          onSelect={moveUp ?? undefined}
        >
          {t("admin.lessons.item.moveUp")}
        </MenuItem>
        <MenuItem
          disabled={!moveDown}
          icon={<ArrowDown />}
          onSelect={moveDown ?? undefined}
        >
          {t("admin.lessons.item.moveDown")}
        </MenuItem>
        {draft.sections.length > 0 ? <MenuSeparator /> : null}
        {within === null ? null : (
          <MoveToItem
            gestureId={item.id}
            label={t("admin.lessons.item.moveToStart")}
            onMove={onMoveItem}
            to={null}
          />
        )}
        {draft.sections.map((section, index) =>
          section.id === within ? null : (
            <MoveToItem
              gestureId={item.id}
              key={section.id}
              label={t("admin.lessons.item.moveTo", {
                section: sectionName(
                  section,
                  index,
                  activeLocale,
                  defaultLocale,
                  untitled
                ),
              })}
              onMove={onMoveItem}
              to={section.id}
            />
          )
        )}
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} onSelect={remove} variant="danger">
          {t("admin.lessons.item.remove")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function ItemRow({
  args,
  within,
}: {
  args: SortableRowArgs<LessonItem>;
  within: SectionRef;
}): ReactNode {
  const { dragHandle, isDragging, item, moveDown, moveUp } = args;
  return (
    <div className="flex flex-col">
      <GestureRow
        className={isDragging ? "bg-popover shadow-2" : undefined}
        dragHandle={dragHandle}
        gesture={{ ...item, categories: [] }}
        trailing={
          <ItemMenu
            item={item}
            moveDown={moveDown}
            moveUp={moveUp}
            within={within}
          />
        }
      />
      <ItemBadges item={item} />
    </div>
  );
}

function ReadOnlyRow({ item }: { item: LessonItem }): ReactNode {
  return (
    <li className="flex flex-col">
      <GestureRow gesture={{ ...item, categories: [] }} />
      <ItemBadges item={item} />
    </li>
  );
}

/** One section's (or the ungrouped part's) gestures: reorderable by drag handle, keyboard or the row menu. */
function ItemList({
  items,
  within,
}: {
  items: readonly LessonItem[];
  within: SectionRef;
}): ReactNode {
  const { t } = useTranslation();
  const { onReorderItems, readOnly } = useStructure();
  const announce = useAnnounce();
  const reorder = useCallback(
    (ids: readonly string[]) => onReorderItems(within, ids),
    [onReorderItems, within]
  );
  const renderRow = useCallback(
    (args: SortableRowArgs<LessonItem>) => (
      <ItemRow args={args} within={within} />
    ),
    [within]
  );
  if (items.length === 0) {
    return (
      <Text size="body-sm" tone="muted">
        {t("admin.lessons.section.empty")}
      </Text>
    );
  }
  if (readOnly) {
    return (
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <ReadOnlyRow item={item} key={item.id} />
        ))}
      </ul>
    );
  }
  return (
    <SortableList
      announce={announce}
      className="flex flex-col gap-1"
      failedMessage={t("admin.lessons.reorder.failed")}
      instructions={t("admin.lessons.reorder.instructions")}
      items={items}
      onReorder={reorder}
      renderRow={renderRow}
    />
  );
}

/** The gestures before the first section. */
export function UngroupedItems(): ReactNode {
  const { t } = useTranslation();
  const { draft } = useStructure();
  if (draft.ungrouped.length === 0 && draft.sections.length > 0) {
    return null;
  }
  return (
    <section
      aria-label={t("admin.lessons.section.ungrouped")}
      className="flex flex-col gap-2"
    >
      {draft.sections.length > 0 ? (
        <Text size="body-sm" tone="muted" weight="medium">
          {t("admin.lessons.section.ungrouped")}
        </Text>
      ) : null}
      <ItemList items={draft.ungrouped} within={null} />
    </section>
  );
}

function SectionCard({
  args,
}: {
  args: SortableRowArgs<LessonSection & { name: string }>;
}): ReactNode {
  const { t } = useTranslation();
  const { activeLocale, defaultLocale, onRemoveSection, onRenameSection } =
    useStructure();
  const { dragHandle, index, isDragging, item, moveDown, moveUp } = args;
  const typed = item.titles[activeLocale] ?? "";
  const placeholder =
    item.titles[defaultLocale] ??
    t("admin.lessons.section.untitled", { number: index + 1 });
  const rename = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onRenameSection(item.id, event.target.value),
    [item.id, onRenameSection]
  );
  const remove = useCallback(
    () => onRemoveSection(item.id),
    [item.id, onRemoveSection]
  );
  return (
    <div
      className={
        isDragging
          ? "flex flex-col gap-3 rounded-xl border border-border bg-popover p-3 shadow-2"
          : "flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
      }
      data-testid="lesson-section"
    >
      <div className="flex items-center gap-2">
        {dragHandle}
        <Input
          aria-label={t("admin.lessons.section.titleLabel", {
            number: index + 1,
          })}
          maxLength={LESSON_TITLE_MAX}
          onChange={rename}
          placeholder={placeholder}
          value={typed}
        />
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              icon={<Ellipsis />}
              label={t("admin.lessons.section.actions", { name: item.name })}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              disabled={!moveUp}
              icon={<ArrowUp />}
              onSelect={moveUp ?? undefined}
            >
              {t("admin.lessons.section.moveUp")}
            </MenuItem>
            <MenuItem
              disabled={!moveDown}
              icon={<ArrowDown />}
              onSelect={moveDown ?? undefined}
            >
              {t("admin.lessons.section.moveDown")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} onSelect={remove} variant="danger">
              {t("admin.lessons.section.remove")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ItemList items={item.items} within={item.id} />
    </div>
  );
}

function ReadOnlySection({
  index,
  section,
}: {
  index: number;
  section: LessonSection;
}): ReactNode {
  const { t } = useTranslation();
  const { activeLocale, defaultLocale } = useStructure();
  const untitled = useCallback(
    (n: number) => t("admin.lessons.section.untitled", { number: n }),
    [t]
  );
  return (
    <section
      aria-label={sectionName(
        section,
        index,
        activeLocale,
        defaultLocale,
        untitled
      )}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="lesson-section"
    >
      <Text weight="semibold">
        {sectionName(section, index, activeLocale, defaultLocale, untitled)}
      </Text>
      <ItemList items={section.items} within={section.id} />
    </section>
  );
}

/** The sections in order: reorderable with the handle (pointer or keyboard) or the section menu. */
export function Sections(): ReactNode {
  const { t } = useTranslation();
  const { activeLocale, defaultLocale, draft, onReorderSections, readOnly } =
    useStructure();
  const announce = useAnnounce();
  const untitled = useCallback(
    (n: number) => t("admin.lessons.section.untitled", { number: n }),
    [t]
  );
  const named = useMemo(
    () =>
      draft.sections.map((section, index) => ({
        ...section,
        name: sectionName(
          section,
          index,
          activeLocale,
          defaultLocale,
          untitled
        ),
      })),
    [activeLocale, defaultLocale, draft.sections, untitled]
  );
  const renderRow = useCallback(
    (args: SortableRowArgs<LessonSection & { name: string }>) => (
      <SectionCard args={args} />
    ),
    []
  );
  if (draft.sections.length === 0) {
    return null;
  }
  if (readOnly) {
    return (
      <div className="flex flex-col gap-3">
        {draft.sections.map((section, index) => (
          <ReadOnlySection index={index} key={section.id} section={section} />
        ))}
      </div>
    );
  }
  return (
    <SortableList
      announce={announce}
      className="flex flex-col gap-3"
      failedMessage={t("admin.lessons.reorder.failed")}
      instructions={t("admin.lessons.reorder.instructions")}
      items={named}
      onReorder={onReorderSections}
      renderRow={renderRow}
    />
  );
}

/** The add buttons under the structure. */
export function StructureActions({
  canAddSection,
  onAddGestures,
  onAddSection,
  hasRoom,
}: {
  canAddSection: boolean;
  hasRoom: boolean;
  onAddGestures: () => void;
  onAddSection: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={!hasRoom} onClick={onAddGestures}>
        {t("admin.lessons.add")}
      </Button>
      <Button
        disabled={!canAddSection}
        onClick={onAddSection}
        variant="secondary"
      >
        {t("admin.lessons.section.add")}
      </Button>
    </div>
  );
}
