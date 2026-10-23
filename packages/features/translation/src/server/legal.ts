/**
 * `translation.legal.*` (phase 10b task 7): the legal texts as versioned
 * rows of `legal_text`. A translator or an admin drafts and publishes (the
 * owner's choice, risk R1: `docs/LEGAL-SIGNOFF.md`), only an admin restores.
 *
 * - A **draft** is the one editable row per (kind, language); every save
 *   changes only it, so the public pages never see it.
 * - **Publish** turns the draft into the next version (renumbered after the
 *   highest published one) with the effective date, then bumps
 *   `i18n:version`, which is the key the public pages' cache follows
 *   (`loadLegalText`).
 * - **Restore** copies an earlier published version into a new published one:
 *   history is never rewritten.
 * Every write is one D1 batch with its audit entry.
 */
import { failWhen, legalText, toGuardFailure, user } from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  LEGAL_CANONICAL_LOCALE,
  type LegalKind,
  validateLegalDocument,
} from "@smog/i18n/legal/markup";
import { bumpI18nVersion } from "@smog/i18n/server";
import { markUnchanged } from "@smog/rpc/audit";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import {
  LEGAL_ISSUE_PREFIX,
  type LegalConflictData,
  type LegalDraft,
  type LegalOverviewItem,
  type LegalVersion,
} from "../schema";
import { auditStatement } from "./audit";
import { adminOnlyProcedure, translatorProcedure } from "./procedure";
import { enabledOf, readLanguages } from "./store";

const UNIQUE_VIOLATION = /UNIQUE constraint failed/i;

/** The VALIDATION data of a refused text: the codes under `content`, each place under `content@<path>`. */
function refusal(issues: readonly { code: string; path: string }[]) {
  const fieldErrors: Record<string, string[]> = {
    content: [...new Set(issues.map((issue) => issue.code))],
  };
  for (const issue of issues) {
    const key = `${LEGAL_ISSUE_PREFIX}${issue.path}`;
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.code];
  }
  return { data: { fieldErrors, formErrors: [] as string[] } };
}

interface Ref {
  kind: LegalKind;
  locale: string;
}

interface PublishedMeta extends LegalVersion {
  id: string;
}

interface StoredDraft extends LegalDraft {
  id: string;
}

/** The published versions of one text, newest first, with their publishers' names. */
async function readHistory(db: Db, ref: Ref): Promise<PublishedMeta[]> {
  const rows = await db
    .select({
      effectiveDate: legalText.effectiveDate,
      id: legalText.id,
      publishedAt: legalText.publishedAt,
      publishedBy: user.name,
      version: legalText.version,
    })
    .from(legalText)
    .leftJoin(user, eq(user.id, legalText.publishedBy))
    .where(
      and(
        eq(legalText.kind, ref.kind),
        eq(legalText.locale, ref.locale),
        eq(legalText.status, "published")
      )
    )
    .orderBy(desc(legalText.version));
  return rows.map((row) => ({
    effectiveDate: row.effectiveDate,
    id: row.id,
    publishedAt: row.publishedAt?.getTime() ?? 0,
    publishedBy: row.publishedBy,
    version: row.version,
  }));
}

async function readDraft(db: Db, ref: Ref): Promise<StoredDraft | null> {
  const [row] = await db
    .select({
      content: legalText.content,
      id: legalText.id,
      updatedAt: legalText.updatedAt,
      updatedBy: user.name,
      version: legalText.version,
    })
    .from(legalText)
    .leftJoin(user, eq(user.id, legalText.updatedBy))
    .where(
      and(
        eq(legalText.kind, ref.kind),
        eq(legalText.locale, ref.locale),
        eq(legalText.status, "draft")
      )
    )
    .limit(1);
  return row
    ? {
        content: row.content,
        id: row.id,
        updatedAt: row.updatedAt.getTime(),
        updatedBy: row.updatedBy,
        version: row.version,
      }
    : null;
}

/** The text of one published version. */
async function readPublishedContent(
  db: Db,
  ref: Ref,
  version: number | null
): Promise<unknown> {
  const [row] = await db
    .select({ content: legalText.content })
    .from(legalText)
    .where(
      and(
        eq(legalText.kind, ref.kind),
        eq(legalText.locale, ref.locale),
        eq(legalText.status, "published"),
        version === null ? undefined : eq(legalText.version, version)
      )
    )
    .orderBy(desc(legalText.version))
    .limit(1);
  return row ? row.content : null;
}

/** The highest version of any state: where a new row numbers from. */
async function highestVersion(db: Db, ref: Ref): Promise<number> {
  const [row] = await db
    .select({ version: sql<number>`coalesce(max(${legalText.version}), 0)` })
    .from(legalText)
    .where(and(eq(legalText.kind, ref.kind), eq(legalText.locale, ref.locale)));
  return row?.version ?? 0;
}

async function isEnabled(db: Db, locale: string): Promise<boolean> {
  return enabledOf(await readLanguages(db)).some(
    (item) => item.code === locale
  );
}

function targetId(ref: Ref, version: number): string {
  return `${ref.kind}:${ref.locale}:${version}`;
}

function conflictOf(
  draft: StoredDraft | null,
  history: readonly PublishedMeta[]
): { data: LegalConflictData } {
  return {
    data: {
      current: draft
        ? {
            content: draft.content,
            updatedAt: draft.updatedAt,
            updatedBy: draft.updatedBy,
            version: draft.version,
          }
        : null,
      publishedVersion: history[0]?.version ?? null,
    },
  };
}

function draftOf(row: StoredDraft): LegalDraft {
  return {
    content: row.content,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

/** The stale guard of a draft write: the row is still the one the editor opened (or, for a first save, still absent). */
function draftStaleWhen(ref: Ref, expectedUpdatedAt: number | null): SQL {
  const rows = sql`SELECT 1 FROM ${legalText} WHERE ${legalText.kind} = ${ref.kind} AND ${legalText.locale} = ${ref.locale} AND ${legalText.status} = 'draft'`;
  return expectedUpdatedAt === null
    ? sql`EXISTS (${rows})`
    : sql`NOT EXISTS (${rows} AND ${legalText.updatedAt} = ${expectedUpdatedAt})`;
}

/** A save after `previous` is strictly later, so `updatedAt` is a usable version stamp. */
function stampAfter(previous: number | null): Date {
  const now = Date.now();
  return new Date(previous !== null && now <= previous ? previous + 1 : now);
}

/** Runs a legal batch; `false` when a guard or a unique index says another editor was first. */
async function runBatch(
  db: Db,
  statements: Parameters<Db["batch"]>[0]
): Promise<boolean> {
  try {
    await db.batch(statements);
    return true;
  } catch (error) {
    if (
      toGuardFailure(error)?.guard === "legal-stale" ||
      UNIQUE_VIOLATION.test(String(error)) ||
      UNIQUE_VIOLATION.test(String((error as Error).cause))
    ) {
      return false;
    }
    console.error("[translation] Failed to write a legal text:", error);
    throw error;
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** The `legal` slice of the translation router. */
export function legalRoutes() {
  return {
    get: translatorProcedure.legal.get.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabled(db, input.locale))) {
          throw errors.NOT_FOUND();
        }
        const history = await readHistory(db, input);
        const draft = await readDraft(db, input);
        const [latest] = history;
        const published = latest
          ? {
              content: await readPublishedContent(db, input, latest.version),
              effectiveDate: latest.effectiveDate,
              publishedAt: latest.publishedAt,
              publishedBy: latest.publishedBy,
              version: latest.version,
            }
          : null;
        const canonical =
          input.locale === LEGAL_CANONICAL_LOCALE
            ? null
            : await readPublishedContent(
                db,
                { kind: input.kind, locale: LEGAL_CANONICAL_LOCALE },
                null
              );
        return {
          canonical,
          draft: draft ? draftOf(draft) : null,
          history: history.map(({ id: _id, ...version }) => version),
          kind: input.kind,
          locale: input.locale,
          published,
        };
      }
    ),
    list: translatorProcedure.legal.list.handler(async ({ context }) => {
      const { db } = context;
      const codes = enabledOf(await readLanguages(db)).map((item) => item.code);
      const rows = await db
        .select({
          effectiveDate: legalText.effectiveDate,
          kind: legalText.kind,
          locale: legalText.locale,
          publishedAt: legalText.publishedAt,
          publishedBy: user.name,
          status: legalText.status,
          updatedAt: legalText.updatedAt,
          version: legalText.version,
        })
        .from(legalText)
        .leftJoin(user, eq(user.id, legalText.publishedBy))
        .orderBy(desc(legalText.version));
      const items: LegalOverviewItem[] = [];
      for (const locale of codes) {
        for (const kind of ["privacy", "terms"] as const) {
          const own = rows.filter(
            (row) => row.kind === kind && row.locale === locale
          );
          const latest = own.find((row) => row.status === "published");
          const draft = own.find((row) => row.status === "draft");
          items.push({
            draft: draft ? { updatedAt: draft.updatedAt.getTime() } : null,
            kind,
            locale,
            published: latest
              ? {
                  effectiveDate: latest.effectiveDate,
                  publishedAt: latest.publishedAt?.getTime() ?? 0,
                  publishedBy: latest.publishedBy,
                  version: latest.version,
                }
              : null,
          });
        }
      }
      return { items };
    }),
    publish: translatorProcedure.legal.publish.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabled(db, input.locale))) {
          throw errors.NOT_FOUND();
        }
        const history = await readHistory(db, input);
        const draft = await readDraft(db, input);
        if (!draft) {
          throw errors.NOT_FOUND();
        }
        if (draft.updatedAt !== input.expectedUpdatedAt) {
          throw errors.CONFLICT(conflictOf(draft, history));
        }
        const version = (history[0]?.version ?? 0) + 1;
        const publishedAt = new Date();
        const published = await runBatch(db, [
          failWhen(
            db,
            "legal-stale",
            sql`NOT EXISTS (SELECT 1 FROM ${legalText} AS d WHERE d.id = ${draft.id} AND d.status = 'draft' AND d.updated_at = ${draft.updatedAt} AND coalesce((SELECT max(p.version) FROM ${legalText} AS p WHERE p.kind = d.kind AND p.locale = d.locale AND p.status = 'published'), 0) = ${version - 1})`
          ),
          db
            .update(legalText)
            .set({
              effectiveDate: input.effectiveDate,
              publishedAt,
              publishedBy: context.user.id,
              status: "published",
              updatedAt: publishedAt,
              updatedBy: context.user.id,
              version,
            })
            .where(
              and(eq(legalText.id, draft.id), eq(legalText.status, "draft"))
            ),
          auditStatement(db, {
            action: "legal.publish",
            actorId: context.user.id,
            data: {
              effectiveDate: input.effectiveDate,
              kind: input.kind,
              locale: input.locale,
              version,
            },
            targetId: targetId(input, version),
            targetType: "legal_text",
          }),
        ]);
        if (!published) {
          throw errors.CONFLICT(
            conflictOf(await readDraft(db, input), await readHistory(db, input))
          );
        }
        await bumpI18nVersion(context.kv);
        return {
          effectiveDate: input.effectiveDate,
          publishedAt: publishedAt.getTime(),
          publishedBy: context.user.name,
          version,
        };
      }
    ),
    restore: adminOnlyProcedure.legal.restore.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabled(db, input.locale))) {
          throw errors.NOT_FOUND();
        }
        const history = await readHistory(db, input);
        if (!history.some((item) => item.version === input.version)) {
          throw errors.NOT_FOUND();
        }
        const content = await readPublishedContent(db, input, input.version);
        const version = (await highestVersion(db, input)) + 1;
        const publishedAt = new Date();
        const written = await runBatch(db, [
          db.insert(legalText).values({
            content,
            effectiveDate: input.effectiveDate,
            id: crypto.randomUUID(),
            kind: input.kind,
            locale: input.locale,
            publishedAt,
            publishedBy: context.user.id,
            status: "published",
            updatedAt: publishedAt,
            updatedBy: context.user.id,
            version,
          }),
          auditStatement(db, {
            action: "legal.restore",
            actorId: context.user.id,
            data: {
              kind: input.kind,
              locale: input.locale,
              restoredFrom: input.version,
              version,
            },
            targetId: targetId(input, version),
            targetType: "legal_text",
          }),
        ]);
        if (!written) {
          throw errors.CONFLICT();
        }
        await bumpI18nVersion(context.kv);
        return {
          effectiveDate: input.effectiveDate,
          publishedAt: publishedAt.getTime(),
          publishedBy: context.user.name,
          version,
        };
      }
    ),
    save: translatorProcedure.legal.save.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabled(db, input.locale))) {
          throw errors.NOT_FOUND();
        }
        const checked = validateLegalDocument(input.kind, input.content);
        if (!checked.document || checked.issues.length > 0) {
          throw errors.VALIDATION(refusal(checked.issues));
        }
        const content = checked.document;
        const history = await readHistory(db, input);
        const draft = await readDraft(db, input);
        if ((draft?.updatedAt ?? null) !== input.expectedUpdatedAt) {
          throw errors.CONFLICT(conflictOf(draft, history));
        }
        if (
          draft &&
          JSON.stringify(draft.content) === JSON.stringify(content)
        ) {
          markUnchanged(db);
          return { draft: draftOf(draft) };
        }
        const updatedAt = stampAfter(draft?.updatedAt ?? null);
        const guard = failWhen(
          db,
          "legal-stale",
          draftStaleWhen(input, input.expectedUpdatedAt)
        );
        const version = draft
          ? draft.version
          : (await highestVersion(db, input)) + 1;
        const write = draft
          ? db
              .update(legalText)
              .set({ content, updatedAt, updatedBy: context.user.id })
              .where(eq(legalText.id, draft.id))
          : db.insert(legalText).values({
              content,
              // Replaced by the date the editor picks at publish.
              effectiveDate: history[0]?.effectiveDate ?? today(),
              id: crypto.randomUUID(),
              kind: input.kind,
              locale: input.locale,
              status: "draft",
              updatedAt,
              updatedBy: context.user.id,
              version,
            });
        const saved = await runBatch(db, [
          guard,
          write,
          auditStatement(db, {
            action: "legal.draft_save",
            actorId: context.user.id,
            data: { kind: input.kind, locale: input.locale, version },
            targetId: targetId(input, version),
            targetType: "legal_text",
          }),
        ]);
        if (!saved) {
          throw errors.CONFLICT(
            conflictOf(await readDraft(db, input), await readHistory(db, input))
          );
        }
        return {
          draft: {
            content,
            updatedAt: updatedAt.getTime(),
            updatedBy: context.user.name,
            version,
          },
        };
      }
    ),
    version: translatorProcedure.legal.version.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const meta = (await readHistory(db, input)).find(
          (item) => item.version === input.version
        );
        if (!meta) {
          throw errors.NOT_FOUND();
        }
        const { id: _id, ...rest } = meta;
        return {
          ...rest,
          content: await readPublishedContent(db, input, input.version),
        };
      }
    ),
  };
}
