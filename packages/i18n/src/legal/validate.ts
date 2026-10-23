import { SAFE_HREF } from "./inline";
import type {
  LegalBlock,
  LegalDocument,
  LegalKind,
  LegalSection,
} from "./types";

/** Why a legal text is refused; the editor shows a message per code. */
export type LegalIssueCode =
  | "badId"
  | "consentControl"
  | "duplicateId"
  | "empty"
  | "html"
  | "shape"
  | "tooLong"
  | "tooMany"
  | "unsafeLink";

export interface LegalIssue {
  code: LegalIssueCode;
  /** Where: `title`, `sections.2.title`, `sections.2.blocks.0`, ... */
  path: string;
}

export interface LegalValidation {
  /** The cleaned document (known keys only), `null` when the shape is wrong. */
  document: LegalDocument | null;
  issues: LegalIssue[];
}

export const LEGAL_LIMITS = {
  blocksPerSection: 100,
  itemsPerList: 100,
  linesPerAddress: 20,
  sections: 60,
  text: 6000,
  title: 200,
} as const;

/** The anchor of a section: lowercase words joined by hyphens. */
const SECTION_ID = /^[a-z]+(?:-[a-z]+)*$/;
/** A tag or a closing tag: the texts are plain inline markup, never HTML. */
const HTML = /<\/?[a-zA-Z!]/;
const LINK = /\[([^\]]+)\]\(([^)]*)\)/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The issues of one inline text (a paragraph, a list item, an address line). */
function inlineIssues(value: unknown, path: string): LegalIssue[] {
  if (typeof value !== "string") {
    return [{ code: "shape", path }];
  }
  const issues: LegalIssue[] = [];
  if (value.trim() === "") {
    issues.push({ code: "empty", path });
  }
  if (value.length > LEGAL_LIMITS.text) {
    issues.push({ code: "tooLong", path });
  }
  if (HTML.test(value)) {
    issues.push({ code: "html", path });
  }
  for (const match of value.matchAll(LINK)) {
    if (!SAFE_HREF.test((match[2] ?? "").trim())) {
      issues.push({ code: "unsafeLink", path });
    }
  }
  return issues;
}

function stringList(
  value: unknown,
  path: string,
  max: number
): { issues: LegalIssue[]; items: string[] | null } {
  if (!Array.isArray(value)) {
    return { issues: [{ code: "shape", path }], items: null };
  }
  if (value.length === 0) {
    return { issues: [{ code: "empty", path }], items: null };
  }
  if (value.length > max) {
    return { issues: [{ code: "tooMany", path }], items: null };
  }
  const issues = value.flatMap((item, index) =>
    inlineIssues(item, `${path}.${index}`)
  );
  return { issues, items: value.map(String) };
}

function blockOf(
  value: unknown,
  path: string
): { block: LegalBlock | null; issues: LegalIssue[] } {
  if (typeof value === "string") {
    return { block: value, issues: inlineIssues(value, path) };
  }
  if (!isRecord(value)) {
    return { block: null, issues: [{ code: "shape", path }] };
  }
  if ("list" in value) {
    const { issues, items } = stringList(
      value.list,
      `${path}.list`,
      LEGAL_LIMITS.itemsPerList
    );
    return { block: items ? { list: items } : null, issues };
  }
  if ("lines" in value) {
    const { issues, items } = stringList(
      value.lines,
      `${path}.lines`,
      LEGAL_LIMITS.linesPerAddress
    );
    return { block: items ? { lines: items } : null, issues };
  }
  if (value.consentControl === true) {
    return { block: { consentControl: true }, issues: [] };
  }
  return { block: null, issues: [{ code: "shape", path }] };
}

function titleIssues(value: unknown, path: string): LegalIssue[] {
  if (typeof value !== "string") {
    return [{ code: "shape", path }];
  }
  const issues: LegalIssue[] = [];
  if (value.trim() === "") {
    issues.push({ code: "empty", path });
  }
  if (value.length > LEGAL_LIMITS.title) {
    issues.push({ code: "tooLong", path });
  }
  if (HTML.test(value)) {
    issues.push({ code: "html", path });
  }
  return issues;
}

function sectionOf(
  value: unknown,
  path: string
): { issues: LegalIssue[]; section: LegalSection | null } {
  if (!(isRecord(value) && Array.isArray(value.blocks))) {
    return { issues: [{ code: "shape", path }], section: null };
  }
  const issues = titleIssues(value.title, `${path}.title`);
  if (typeof value.id !== "string") {
    issues.push({ code: "shape", path: `${path}.id` });
  } else if (!SECTION_ID.test(value.id)) {
    issues.push({ code: "badId", path: `${path}.id` });
  }
  if (value.blocks.length === 0) {
    issues.push({ code: "empty", path: `${path}.blocks` });
  }
  if (value.blocks.length > LEGAL_LIMITS.blocksPerSection) {
    issues.push({ code: "tooMany", path: `${path}.blocks` });
  }
  const blocks: LegalBlock[] = [];
  for (const [index, raw] of value.blocks.entries()) {
    const parsed = blockOf(raw, `${path}.blocks.${index}`);
    issues.push(...parsed.issues);
    if (parsed.block !== null) {
      blocks.push(parsed.block);
    }
  }
  return {
    issues,
    section: {
      blocks,
      id: String(value.id),
      title: String(value.title),
    },
  };
}

function consentControls(sections: readonly LegalSection[]): number {
  return sections
    .flatMap((section) => section.blocks)
    .filter((block) => typeof block === "object" && "consentControl" in block)
    .length;
}

/**
 * Checks a legal text before it is stored (a draft save): the structure
 * (`LegalDocument`), the limits, the section anchors (unique, the shape of
 * `/privacy#rights`), the restricted inline markup (no HTML; links only
 * `https:`, `mailto:` or a site path) and the consent switch: the privacy
 * text carries exactly one (the page puts the analytics control there), the
 * terms none.
 */
export function validateLegalDocument(
  kind: LegalKind,
  value: unknown
): LegalValidation {
  if (!(isRecord(value) && Array.isArray(value.sections))) {
    return { document: null, issues: [{ code: "shape", path: "" }] };
  }
  const issues = titleIssues(value.title, "title");
  if (value.sections.length === 0) {
    issues.push({ code: "empty", path: "sections" });
  }
  if (value.sections.length > LEGAL_LIMITS.sections) {
    issues.push({ code: "tooMany", path: "sections" });
  }
  const sections: LegalSection[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.sections.entries()) {
    const parsed = sectionOf(raw, `sections.${index}`);
    issues.push(...parsed.issues);
    if (parsed.section) {
      if (seen.has(parsed.section.id)) {
        issues.push({ code: "duplicateId", path: `sections.${index}.id` });
      }
      seen.add(parsed.section.id);
      sections.push(parsed.section);
    }
  }
  const controls = consentControls(sections);
  if (controls !== (kind === "privacy" ? 1 : 0)) {
    issues.push({ code: "consentControl", path: "sections" });
  }
  return {
    document: { sections, title: String(value.title) },
    issues,
  };
}
