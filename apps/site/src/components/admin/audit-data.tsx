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
  type TranslationKey,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { Badge, Text, TextLink } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";

/*
 * One literal key per enum value (never a template-literal key cast to one
 * literal): TypeScript checks each against the catalogue once, and `t`
 * never widens to the whole key union (TS2589; DECISIONS, phase 5 task 3).
 * `audit-data.test.ts` checks that each label exists in every locale.
 */
const ACTION_LABEL_KEYS = {
  "category.create": "admin.audit.actions.category.create",
  "category.delete": "admin.audit.actions.category.delete",
  "category.publish": "admin.audit.actions.category.publish",
  "category.reorder": "admin.audit.actions.category.reorder",
  "category.unpublish": "admin.audit.actions.category.unpublish",
  "category.update": "admin.audit.actions.category.update",
  "export.sponsorships_csv": "admin.audit.actions.export.sponsorships_csv",
  "gesture.bulk_update": "admin.audit.actions.gesture.bulk_update",
  "gesture.create": "admin.audit.actions.gesture.create",
  "gesture.delete": "admin.audit.actions.gesture.delete",
  "gesture.publish": "admin.audit.actions.gesture.publish",
  "gesture.unpublish": "admin.audit.actions.gesture.unpublish",
  "gesture.update": "admin.audit.actions.gesture.update",
  legacy: "admin.audit.actions.legacy",
  "maintenance.disable": "admin.audit.actions.maintenance.disable",
  "maintenance.enable": "admin.audit.actions.maintenance.enable",
  "payment.refund": "admin.audit.actions.payment.refund",
  "sponsorship.approve": "admin.audit.actions.sponsorship.approve",
  "sponsorship.cancel": "admin.audit.actions.sponsorship.cancel",
  "sponsorship.force_expire": "admin.audit.actions.sponsorship.force_expire",
  "sponsorship.mark_paid": "admin.audit.actions.sponsorship.mark_paid",
  "sponsorship.regenerate_token":
    "admin.audit.actions.sponsorship.regenerate_token",
  "sponsorship.reject": "admin.audit.actions.sponsorship.reject",
  "sponsorship.request_changes":
    "admin.audit.actions.sponsorship.request_changes",
  "sponsorship.retry_render": "admin.audit.actions.sponsorship.retry_render",
  "user.ban": "admin.audit.actions.user.ban",
  "user.delete": "admin.audit.actions.user.delete",
  "user.impersonate": "admin.audit.actions.user.impersonate",
  "user.role_change": "admin.audit.actions.user.role_change",
  "user.unban": "admin.audit.actions.user.unban",
} as const satisfies Record<AuditAction, TranslationKey>;

const TARGET_TYPE_LABEL_KEYS = {
  category: "admin.audit.targetTypes.category",
  gesture: "admin.audit.targetTypes.gesture",
  list: "admin.audit.targetTypes.list",
  payment: "admin.audit.targetTypes.payment",
  setting: "admin.audit.targetTypes.setting",
  sponsorship: "admin.audit.targetTypes.sponsorship",
  system: "admin.audit.targetTypes.system",
  user: "admin.audit.targetTypes.user",
} as const satisfies Record<AuditTargetType, TranslationKey>;

/** "Gesture created" for `gesture.create`. */
export function actionLabel(t: Translate, action: AuditAction): string {
  return t(ACTION_LABEL_KEYS[action]);
}

export function targetTypeLabel(t: Translate, type: AuditTargetType): string {
  return t(TARGET_TYPE_LABEL_KEYS[type]);
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
