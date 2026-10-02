import type {
  AuditAction,
  AuditEntry,
  AuditTargetType,
} from "@smog/admin/schema";
import {
  DEFAULT_LOCALE,
  formatDate,
  isLocale,
  type Translate,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Badge, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";

/*
 * The label keys are built from the enums (`admin.audit.actions.gesture.create`).
 * `Translate` (`@smog/i18n`) checks the built keys without i18next's whole
 * return-type expansion (TS2589 on a large catalogue);
 * `audit-data.test.ts` checks that each action and target type has its
 * label in every locale.
 */

/** "Gesture created" for `gesture.create`. */
export function actionLabel(t: Translate, action: AuditAction): string {
  return t(`admin.audit.actions.${action}`);
}

export function targetTypeLabel(t: Translate, type: AuditTargetType): string {
  return t(`admin.audit.targetTypes.${type}`);
}

/** A typed link to the target's admin page. */
export type AuditTargetLink =
  | { params: { id: string }; to: "/admin/gestures/$id" }
  | { search: { user: string }; to: "/admin/users" }
  | { to: "/admin/categories" | "/admin/settings" };

/**
 * Where the target lives in the admin, if it has a page: the gesture
 * editor, the user (the users screen opens its panel for `?user=`), the
 * categories or the settings.
 */
export function auditTargetLink(entry: AuditEntry): AuditTargetLink | null {
  const id = entry.targetId;
  if (!id) {
    return null;
  }
  switch (entry.targetType) {
    case "gesture":
      return { params: { id }, to: "/admin/gestures/$id" };
    case "category":
      return { to: "/admin/categories" };
    case "user":
      return { search: { user: id }, to: "/admin/users" };
    case "setting":
      return { to: "/admin/settings" };
    default:
      return null;
  }
}

/** A timestamp as date and time in the page's language (Brussels time). */
export function useAuditTime(): (ms: number) => string {
  const { i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  return useCallback(
    (ms: number) =>
      formatDate(ms, locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );
}

/** The actor's name, or "Deleted account" once the account is gone. */
export function AuditActorName({
  actor,
}: {
  actor: AuditEntry["actor"];
}): ReactNode {
  const { t } = useTranslation();
  if (!actor) {
    return (
      <Text as="span" size="body-sm" tone="muted">
        {t("admin.audit.deletedActor")}
      </Text>
    );
  }
  return actor.name;
}

/** The target type and id, e.g. "Gesture · 3f2…". */
export function AuditTarget({ entry }: { entry: AuditEntry }): ReactNode {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Badge>{targetTypeLabel(t, entry.targetType)}</Badge>
      <Text
        as="span"
        className="truncate font-mono"
        size="caption"
        tone="muted"
      >
        {entry.targetId ?? t("admin.audit.noTarget")}
      </Text>
    </span>
  );
}

function Row({ label, children }: { children: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt>
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0 text-body-sm">{children}</dd>
    </div>
  );
}

/**
 * One entry in full (the audit Sheet): when, the action, the target with a
 * link to its page, the actor, and the data pretty-printed.
 */
export function AuditDetail({ entry }: { entry: AuditEntry }): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const link = auditTargetLink(entry);
  return (
    <dl className="flex flex-col gap-4">
      <Row label={t("admin.audit.detail.when")}>
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {time(entry.createdAt)}
        </time>
      </Row>
      <Row label={t("admin.audit.columns.action")}>
        {actionLabel(t, entry.action)}{" "}
        <Text as="span" className="font-mono" size="caption" tone="muted">
          {entry.action}
        </Text>
      </Row>
      <Row label={t("admin.audit.detail.target")}>
        <div className="flex flex-wrap items-center gap-3">
          <AuditTarget entry={entry} />
          {link ? (
            <TextLink asChild>
              <Link {...link}>{t("admin.audit.detail.open")}</Link>
            </TextLink>
          ) : null}
        </div>
      </Row>
      <Row label={t("admin.audit.detail.actor")}>
        <AuditActorName actor={entry.actor} />
      </Row>
      <Row label={t("admin.audit.detail.data")}>
        {/* Scrollable, so it takes focus (keyboard scrolling, axe). */}
        <section
          aria-label={t("admin.audit.detail.data")}
          className="max-h-96 overflow-auto rounded-md border border-border-subtle bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
          tabIndex={0}
        >
          <pre className="p-3 font-mono text-caption text-foreground">
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        </section>
      </Row>
    </dl>
  );
}
