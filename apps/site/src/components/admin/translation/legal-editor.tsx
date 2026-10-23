import type { TranslationKey } from "@smog/i18n";
import type {
  LegalBlock,
  LegalDocument,
  LegalIssue,
  LegalIssueCode,
  LegalSection,
} from "@smog/i18n/legal/markup";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Text,
  Textarea,
} from "@smog/ui-web";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback, useMemo } from "react";

/** The message of each issue code (shown next to the part it is about). */
const LEGAL_ISSUE_MESSAGES = {
  badId: "admin.translation.legal.issues.badId",
  consentControl: "admin.translation.legal.issues.consentControl",
  duplicateId: "admin.translation.legal.issues.duplicateId",
  empty: "admin.translation.legal.issues.empty",
  html: "admin.translation.legal.issues.html",
  shape: "admin.translation.legal.issues.shape",
  tooLong: "admin.translation.legal.issues.tooLong",
  tooMany: "admin.translation.legal.issues.tooMany",
  unsafeLink: "admin.translation.legal.issues.unsafeLink",
} as const satisfies Record<LegalIssueCode, TranslationKey>;

type BlockKind = "consent" | "lines" | "list" | "paragraph";

const BLOCK_KINDS: readonly BlockKind[] = [
  "paragraph",
  "list",
  "lines",
  "consent",
];

const BLOCK_LABELS = {
  consent: "admin.translation.legal.blocks.consent",
  lines: "admin.translation.legal.blocks.lines",
  list: "admin.translation.legal.blocks.list",
  paragraph: "admin.translation.legal.blocks.paragraph",
} as const satisfies Record<BlockKind, TranslationKey>;

function kindOf(block: LegalBlock): BlockKind {
  if (typeof block === "string") {
    return "paragraph";
  }
  if ("list" in block) {
    return "list";
  }
  if ("lines" in block) {
    return "lines";
  }
  return "consent";
}

function emptyBlock(kind: BlockKind): LegalBlock {
  switch (kind) {
    case "list":
      return { list: [""] };
    case "lines":
      return { lines: [""] };
    case "consent":
      return { consentControl: true };
    default:
      return "";
  }
}

/** The text a block edits in its textarea: a paragraph, or one list item or address line per line. */
function textOf(block: LegalBlock): string {
  if (typeof block === "string") {
    return block;
  }
  if ("list" in block) {
    return block.list.join("\n");
  }
  if ("lines" in block) {
    return block.lines.join("\n");
  }
  return "";
}

function withText(block: LegalBlock, text: string): LegalBlock {
  if (typeof block === "string") {
    return text;
  }
  if ("list" in block) {
    return { list: text.split("\n") };
  }
  if ("lines" in block) {
    return { lines: text.split("\n") };
  }
  return block;
}

/** `a` moved to `b` in a copy of `items`. */
function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

function IssueList({
  issues,
  path,
}: {
  issues: readonly LegalIssue[];
  path: string;
}): ReactNode {
  const { t } = useTranslation();
  const own = issues.filter((issue) => issue.path === path);
  if (own.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1" data-testid="legal-issues">
      {own.map((issue) => (
        <li key={issue.code}>
          <Text as="span" size="body-sm" tone="danger">
            {t(LEGAL_ISSUE_MESSAGES[issue.code])}
          </Text>
        </li>
      ))}
    </ul>
  );
}

interface BlockEditorProps {
  block: LegalBlock;
  count: number;
  disabled: boolean;
  index: number;
  issues: readonly LegalIssue[];
  onChange: (index: number, block: LegalBlock) => void;
  onMove: (index: number, to: number) => void;
  onRemove: (index: number) => void;
  path: string;
  section: number;
}

function BlockEditor({
  block,
  count,
  disabled,
  index,
  issues,
  onChange,
  onMove,
  onRemove,
  path,
  section,
}: BlockEditorProps): ReactNode {
  const { t } = useTranslation();
  const kind = kindOf(block);
  const label = t("admin.translation.legal.blockLabel", {
    block: index + 1,
    kind: t(BLOCK_LABELS[kind]),
    section: section + 1,
  });
  const onText = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onChange(index, withText(block, event.target.value)),
    [block, index, onChange]
  );
  const up = useCallback(() => onMove(index, index - 1), [index, onMove]);
  const down = useCallback(() => onMove(index, index + 1), [index, onMove]);
  const remove = useCallback(() => onRemove(index), [index, onRemove]);
  const own = issues.filter(
    (issue) => issue.path === path || issue.path.startsWith(`${path}.`)
  );
  return (
    <div className="flex flex-col gap-2" data-testid="legal-block">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge>{t(BLOCK_LABELS[kind])}</Badge>
        <div className="flex items-center gap-1">
          <IconButton
            disabled={disabled || index === 0}
            icon={<ArrowUp />}
            label={t("admin.translation.legal.moveUp", { label })}
            onClick={up}
            size="sm"
            variant="ghost"
          />
          <IconButton
            disabled={disabled || index === count - 1}
            icon={<ArrowDown />}
            label={t("admin.translation.legal.moveDown", { label })}
            onClick={down}
            size="sm"
            variant="ghost"
          />
          <IconButton
            disabled={disabled}
            icon={<Trash2 />}
            label={t("admin.translation.legal.removeBlock", { label })}
            onClick={remove}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>
      {kind === "consent" ? (
        <Text size="body-sm" tone="muted">
          {t("admin.translation.legal.consentHint")}
        </Text>
      ) : (
        <Field
          hint={
            kind === "paragraph"
              ? undefined
              : t("admin.translation.legal.onePerLine")
          }
          label={label}
        >
          <Textarea
            disabled={disabled}
            invalid={own.length > 0}
            onChange={onText}
            rows={kind === "paragraph" ? 4 : 5}
            value={textOf(block)}
          />
        </Field>
      )}
      {own.map((issue) => (
        <Text
          as="span"
          key={`${issue.path}-${issue.code}`}
          size="body-sm"
          tone="danger"
        >
          {t(LEGAL_ISSUE_MESSAGES[issue.code])}
        </Text>
      ))}
    </div>
  );
}

interface SectionEditorProps {
  count: number;
  disabled: boolean;
  index: number;
  issues: readonly LegalIssue[];
  onChange: (index: number, section: LegalSection) => void;
  onMove: (index: number, to: number) => void;
  onRemove: (index: number) => void;
  section: LegalSection;
}

function AddBlockMenu({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (kind: BlockKind) => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          disabled={disabled}
          icon={<Plus />}
          size="sm"
          variant="secondary"
        >
          {t("admin.translation.legal.addBlock")}
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        {BLOCK_KINDS.map((kind) => (
          <AddBlockItem key={kind} kind={kind} onAdd={onAdd} />
        ))}
      </MenuContent>
    </Menu>
  );
}

function AddBlockItem({
  kind,
  onAdd,
}: {
  kind: BlockKind;
  onAdd: (kind: BlockKind) => void;
}): ReactNode {
  const { t } = useTranslation();
  const select = useCallback(() => onAdd(kind), [kind, onAdd]);
  return <MenuItem onSelect={select}>{t(BLOCK_LABELS[kind])}</MenuItem>;
}

function SectionEditor({
  count,
  disabled,
  index,
  issues,
  onChange,
  onMove,
  onRemove,
  section,
}: SectionEditorProps): ReactNode {
  const { t } = useTranslation();
  const path = `sections.${index}`;
  const heading = t("admin.translation.legal.sectionLabel", {
    number: index + 1,
  });
  const setTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange(index, { ...section, title: event.target.value }),
    [index, onChange, section]
  );
  const setId = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange(index, { ...section, id: event.target.value }),
    [index, onChange, section]
  );
  const setBlock = useCallback(
    (at: number, block: LegalBlock) =>
      onChange(index, {
        ...section,
        blocks: section.blocks.map((item, i) => (i === at ? block : item)),
      }),
    [index, onChange, section]
  );
  const moveBlock = useCallback(
    (from: number, to: number) =>
      onChange(index, { ...section, blocks: moved(section.blocks, from, to) }),
    [index, onChange, section]
  );
  const removeBlock = useCallback(
    (at: number) =>
      onChange(index, {
        ...section,
        blocks: section.blocks.filter((_, i) => i !== at),
      }),
    [index, onChange, section]
  );
  const addBlock = useCallback(
    (kind: BlockKind) =>
      onChange(index, {
        ...section,
        blocks: [...section.blocks, emptyBlock(kind)],
      }),
    [index, onChange, section]
  );
  const up = useCallback(() => onMove(index, index - 1), [index, onMove]);
  const down = useCallback(() => onMove(index, index + 1), [index, onMove]);
  const remove = useCallback(() => onRemove(index), [index, onRemove]);
  const idIssues = issues.filter((issue) => issue.path === `${path}.id`);
  const titleIssues = issues.filter((issue) => issue.path === `${path}.title`);
  return (
    <Card
      aria-label={heading}
      className="flex flex-col gap-4 p-4"
      data-testid="legal-section"
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="span" weight="semibold">
          {heading}
        </Text>
        <div className="flex items-center gap-1">
          <IconButton
            disabled={disabled || index === 0}
            icon={<ArrowUp />}
            label={t("admin.translation.legal.moveUp", { label: heading })}
            onClick={up}
            size="sm"
            variant="ghost"
          />
          <IconButton
            disabled={disabled || index === count - 1}
            icon={<ArrowDown />}
            label={t("admin.translation.legal.moveDown", {
              label: heading,
            })}
            onClick={down}
            size="sm"
            variant="ghost"
          />
          <IconButton
            disabled={disabled}
            icon={<Trash2 />}
            label={t("admin.translation.legal.removeSection", {
              label: heading,
            })}
            onClick={remove}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field
          error={
            titleIssues[0]
              ? t(LEGAL_ISSUE_MESSAGES[titleIssues[0].code])
              : undefined
          }
          label={t("admin.translation.legal.sectionTitle")}
        >
          <Input
            disabled={disabled}
            onChange={setTitle}
            value={section.title}
          />
        </Field>
        <Field
          error={
            idIssues[0] ? t(LEGAL_ISSUE_MESSAGES[idIssues[0].code]) : undefined
          }
          hint={t("admin.translation.legal.anchorHint")}
          label={t("admin.translation.legal.anchor")}
        >
          <Input
            autoCapitalize="off"
            disabled={disabled}
            onChange={setId}
            value={section.id}
          />
        </Field>
      </div>
      <IssueList issues={issues} path={`${path}.blocks`} />
      {section.blocks.map((block, blockIndex) => (
        <BlockEditor
          block={block}
          count={section.blocks.length}
          disabled={disabled}
          index={blockIndex}
          issues={issues}
          // A block has no id of its own: its place is its identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={blockIndex}
          onChange={setBlock}
          onMove={moveBlock}
          onRemove={removeBlock}
          path={`${path}.blocks.${blockIndex}`}
          section={index}
        />
      ))}
      <div>
        <AddBlockMenu disabled={disabled} onAdd={addBlock} />
      </div>
    </Card>
  );
}

export interface LegalEditorProps {
  disabled?: boolean;
  issues: readonly LegalIssue[];
  onChange: (document: LegalDocument) => void;
  value: LegalDocument;
}

/**
 * The block editor of one legal text: the title, then sections of
 * paragraphs, lists, address lines and (privacy only) the consent control.
 * Inline text takes `**bold**` and `[text](https://…)` (links only
 * `https:`, `mailto:` or a site path); the issues of `validateLegalDocument`
 * show next to the part they are about. A controlled component.
 */
export function LegalEditor({
  disabled = false,
  issues,
  onChange,
  value,
}: LegalEditorProps): ReactNode {
  const { t } = useTranslation();
  const setTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, title: event.target.value }),
    [onChange, value]
  );
  const setSection = useCallback(
    (at: number, section: LegalSection) =>
      onChange({
        ...value,
        sections: value.sections.map((item, i) => (i === at ? section : item)),
      }),
    [onChange, value]
  );
  const moveSection = useCallback(
    (from: number, to: number) =>
      onChange({ ...value, sections: moved(value.sections, from, to) }),
    [onChange, value]
  );
  const removeSection = useCallback(
    (at: number) =>
      onChange({
        ...value,
        sections: value.sections.filter((_, i) => i !== at),
      }),
    [onChange, value]
  );
  const addSection = useCallback(() => {
    const taken = new Set(value.sections.map((section) => section.id));
    let id = "new-section";
    for (const suffix of ["", "-a", "-b", "-c", "-d", "-e", "-f", "-g"]) {
      id = `new-section${suffix}`;
      if (!taken.has(id)) {
        break;
      }
    }
    onChange({
      ...value,
      sections: [...value.sections, { blocks: [""], id, title: "" }],
    });
  }, [onChange, value]);
  const titleIssue = useMemo(
    () => issues.find((issue) => issue.path === "title"),
    [issues]
  );
  return (
    <div className="flex flex-col gap-4">
      <Field
        error={
          titleIssue ? t(LEGAL_ISSUE_MESSAGES[titleIssue.code]) : undefined
        }
        label={t("admin.translation.legal.documentTitle")}
      >
        <Input disabled={disabled} onChange={setTitle} value={value.title} />
      </Field>
      <Text size="body-sm" tone="muted">
        {t("admin.translation.legal.markupHint")}
      </Text>
      <IssueList issues={issues} path="sections" />
      {value.sections.map((section, index) => (
        <SectionEditor
          count={value.sections.length}
          disabled={disabled}
          index={index}
          issues={issues}
          // The anchor is editable, so it cannot be the key: the place is.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={index}
          onChange={setSection}
          onMove={moveSection}
          onRemove={removeSection}
          section={section}
        />
      ))}
      <div>
        <Button
          disabled={disabled}
          icon={<Plus />}
          onClick={addSection}
          variant="secondary"
        >
          {t("admin.translation.legal.addSection")}
        </Button>
      </div>
    </div>
  );
}
