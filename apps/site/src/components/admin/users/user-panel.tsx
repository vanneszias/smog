import {
  useAdminUser,
  useAdminUserActions,
  userRefusalOf,
} from "@smog/admin/client";
import {
  type AdminUserDetail,
  BAN_DAYS_MAX,
  BAN_REASON_MAX,
  type UserGuardReason,
} from "@smog/admin/schema";
import type { Translate, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Button,
  cn,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  Input,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  Text,
  Textarea,
  useToast,
} from "@smog/ui-web";
import {
  Ban,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Undo2,
  UserX,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";
import { useAuditTime } from "../audit-data";
import { RoleBadge, StatusBadge, useUserDate } from "./user-table";

/** The ban lengths offered (days); `forever` has no end. */
const BAN_DAYS = [1, 7, 30, 90, BAN_DAYS_MAX] as const;
const FOREVER = "forever";

const REFUSED = {
  adminTarget: "admin.users.refused.adminTarget",
  alreadyBanned: "admin.users.refused.alreadyBanned",
  lastAdmin: "admin.users.refused.lastAdmin",
  notBanned: "admin.users.refused.notBanned",
  self: "admin.users.refused.self",
  targetBanned: "admin.users.refused.targetBanned",
  unchanged: "admin.users.refused.unchanged",
} as const satisfies Record<UserGuardReason, TranslationKey>;

/** The sign-in methods with a label; another provider shows its id. */
const METHODS: Readonly<Record<string, TranslationKey>> = {
  apple: "admin.users.methods.apple",
  credential: "admin.users.methods.credential",
  google: "admin.users.methods.google",
  passkey: "admin.users.methods.passkey",
};

/** What a refused or failed action shows (the guard's reason when it has one). */
export function userActionError(t: Translate, error: unknown): string {
  const reason = userRefusalOf(error);
  if (reason) {
    return t(REFUSED[reason]);
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "NOT_FOUND") {
    return t("admin.users.refused.notFound");
  }
  if (code === "VALIDATION") {
    return t("admin.users.refused.emailMismatch");
  }
  return t("auth.errors.generic");
}

function methodLabel(t: Translate, method: string): string {
  const key = METHODS[method];
  return key ? t(key) : method;
}

function Row({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}): ReactNode {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt>
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0 break-words text-body-sm">{children}</dd>
    </div>
  );
}

function UserFacts({ user }: { user: AdminUserDetail }): ReactNode {
  const { t } = useTranslation();
  const date = useUserDate();
  const time = useAuditTime();
  return (
    <dl className="grid grid-cols-2 gap-4">
      <Row className="col-span-2" label={t("admin.users.panel.email")}>
        {user.email}
      </Row>
      <Row label={t("admin.users.panel.role")}>
        <RoleBadge role={user.role} />
      </Row>
      <Row label={t("admin.users.panel.status")}>
        <StatusBadge user={user} />
      </Row>
      {user.banned ? (
        <>
          <Row className="col-span-2" label={t("admin.users.panel.banReason")}>
            {user.banReason}
          </Row>
          <Row className="col-span-2" label={t("admin.users.panel.banUntil")}>
            {user.banExpires === null
              ? t("admin.users.panel.banForever")
              : time(user.banExpires)}
          </Row>
        </>
      ) : null}
      <Row label={t("admin.users.panel.created")}>
        <time dateTime={new Date(user.createdAt).toISOString()}>
          {date(user.createdAt)}
        </time>
      </Row>
      <Row label={t("admin.users.panel.methods")}>
        {user.methods.length > 0
          ? user.methods.map((method) => methodLabel(t, method)).join(", ")
          : t("admin.users.panel.noMethods")}
      </Row>
      <Row label={t("admin.users.panel.sessions")}>
        <span className="tabular-nums">{user.sessions}</span>
      </Row>
      <Row label={t("admin.users.panel.favorites")}>
        <span className="tabular-nums">{user.favorites}</span>
      </Row>
      <Row label={t("admin.users.panel.lists")}>
        <span className="tabular-nums">{user.lists}</span>
      </Row>
    </dl>
  );
}

type DialogKind = "ban" | "delete" | "role" | "unban";

/**
 * Why some actions are off (the admin's own account, an admin, a ban) and
 * which buttons the note describes (M-6).
 */
function actionNotes(isSelf: boolean, user: AdminUserDetail) {
  const isAdmin = user.role === "admin";
  const promoteBlocked = !(isAdmin || isSelf) && user.banned;
  let key: TranslationKey | null = null;
  if (isSelf) {
    key = "admin.users.panel.self";
  } else if (isAdmin) {
    key = "admin.users.panel.adminTarget";
  } else if (promoteBlocked) {
    key = "admin.users.panel.bannedTarget";
  }
  return {
    banDescribed: isSelf || isAdmin,
    key,
    promoteBlocked,
    roleDescribed: isSelf || promoteBlocked,
  };
}

interface ActionsProps {
  isSelf: boolean;
  onDeleted: () => void;
  user: AdminUserDetail;
}

/**
 * The actions, each behind an AlertDialog: promote or demote, ban (reason
 * and length), lift a ban, delete (type the email). Disabled, with the
 * reason, on the admin's own account; ban and delete wait for a demotion.
 * The server runs the same guards (ruling 7).
 */
function UserActions({ isSelf, onDeleted, user }: ActionsProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useAdminUserActions();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<string>(FOREVER);
  const [confirmEmail, setConfirmEmail] = useState("");
  const name = user.name || user.email;
  const isAdmin = user.role === "admin";

  const openDialog = useCallback((kind: DialogKind) => {
    setReason("");
    setDays(FOREVER);
    setConfirmEmail("");
    setDialog(kind);
  }, []);
  const openRole = useCallback(() => openDialog("role"), [openDialog]);
  const openBan = useCallback(() => openDialog("ban"), [openDialog]);
  const openUnban = useCallback(() => openDialog("unban"), [openDialog]);
  const openDelete = useCallback(() => openDialog("delete"), [openDialog]);
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDialog(null);
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>, done: string) => {
      try {
        await action();
        toast({ title: done, variant: "success" });
        return true;
      } catch (error) {
        console.error("[admin] Failed to change the user:", error);
        toast({ title: userActionError(t, error), variant: "danger" });
        return false;
      }
    },
    [t, toast]
  );

  const confirmRole = useCallback(() => {
    const role = isAdmin ? "user" : "admin";
    run(
      () => actions.setRole.mutateAsync({ role, userId: user.id }),
      t(isAdmin ? "admin.users.demote.done" : "admin.users.promote.done", {
        name,
      })
    ).catch(() => undefined);
  }, [actions.setRole, isAdmin, name, run, t, user.id]);

  const confirmBan = useCallback(() => {
    run(
      () =>
        actions.ban.mutateAsync({
          ...(days === FOREVER ? {} : { expiresInDays: Number(days) }),
          reason,
          userId: user.id,
        }),
      t("admin.users.ban.done", { name })
    ).catch(() => undefined);
  }, [actions.ban, days, name, reason, run, t, user.id]);

  const confirmUnban = useCallback(() => {
    run(
      () => actions.unban.mutateAsync({ userId: user.id }),
      t("admin.users.unban.done", { name })
    ).catch(() => undefined);
  }, [actions.unban, name, run, t, user.id]);

  const confirmDelete = useCallback(() => {
    run(
      () => actions.remove.mutateAsync({ confirmEmail, userId: user.id }),
      t("admin.users.delete.done")
    )
      .then((ok) => {
        if (ok) {
          onDeleted();
        }
      })
      .catch(() => undefined);
  }, [actions.remove, confirmEmail, onDeleted, run, t, user.id]);

  const onReason = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value),
    []
  );
  const onConfirmEmail = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setConfirmEmail(event.target.value),
    []
  );
  const emailMatches =
    confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const busy = [
    actions.setRole,
    actions.ban,
    actions.unban,
    actions.remove,
  ].some((action) => action.isPending);
  const locked = isSelf || busy;
  // The reason an action is off, tied to its buttons (M-6): a disabled
  // button is skipped by Tab, so a screen reader needs the description.
  const noteId = useId();
  const notes = actionNotes(isSelf, user);
  const { promoteBlocked } = notes;
  const note = notes.key ? t(notes.key) : null;
  const roleNote = notes.roleDescribed ? noteId : undefined;
  const banNote = notes.banDescribed ? noteId : undefined;
  const durationOptions = [
    { label: t("admin.users.ban.forever"), value: FOREVER },
    ...BAN_DAYS.map((count) => ({
      label: t("admin.users.ban.days", { count }),
      value: String(count),
    })),
  ];

  return (
    <section
      aria-labelledby="user-actions-heading"
      className="flex flex-col gap-3 border-border-subtle border-t pt-4"
    >
      <Heading id="user-actions-heading" level={3}>
        {t("admin.users.panel.actions")}
      </Heading>
      {note ? (
        <Text id={noteId} size="body-sm" tone="muted">
          {note}
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          aria-describedby={roleNote}
          disabled={locked || promoteBlocked}
          icon={isAdmin ? <ShieldOff /> : <ShieldCheck />}
          loading={actions.setRole.isPending}
          onClick={openRole}
          size="sm"
          variant="secondary"
        >
          {t(
            isAdmin ? "admin.users.demote.action" : "admin.users.promote.action"
          )}
        </Button>
        {user.banned ? (
          <Button
            aria-describedby={isSelf ? noteId : undefined}
            disabled={locked}
            icon={<Undo2 />}
            loading={actions.unban.isPending}
            onClick={openUnban}
            size="sm"
            variant="secondary"
          >
            {t("admin.users.unban.action")}
          </Button>
        ) : (
          <Button
            aria-describedby={banNote}
            disabled={locked || isAdmin}
            icon={<Ban />}
            loading={actions.ban.isPending}
            onClick={openBan}
            size="sm"
            variant="secondary"
          >
            {t("admin.users.ban.action")}
          </Button>
        )}
        <Button
          aria-describedby={banNote}
          disabled={locked || isAdmin}
          icon={<Trash2 />}
          loading={actions.remove.isPending}
          onClick={openDelete}
          size="sm"
          variant="danger"
        >
          {t("admin.users.delete.action")}
        </Button>
      </div>

      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t(
          isAdmin ? "admin.users.demote.action" : "admin.users.promote.action"
        )}
        description={t(
          isAdmin
            ? "admin.users.demote.description"
            : "admin.users.promote.description"
        )}
        onConfirm={confirmRole}
        onOpenChange={onOpenChange}
        open={dialog === "role"}
        title={t(
          isAdmin ? "admin.users.demote.title" : "admin.users.promote.title",
          { name }
        )}
      />
      <AlertDialog
        body={
          <>
            <Field
              counter={{ count: reason.trim().length, max: BAN_REASON_MAX }}
              hint={t("admin.users.ban.reasonHint")}
              label={t("admin.users.ban.reason")}
              required
            >
              <Textarea
                maxLength={BAN_REASON_MAX}
                onChange={onReason}
                rows={3}
                value={reason}
              />
            </Field>
            <Field label={t("admin.users.ban.duration")}>
              <Select
                onValueChange={setDays}
                options={durationOptions}
                value={days}
              />
            </Field>
          </>
        }
        className="wrap-anywhere"
        confirmDisabled={reason.trim().length === 0}
        confirmLabel={t("admin.users.ban.action")}
        description={t("admin.users.ban.description")}
        onConfirm={confirmBan}
        onOpenChange={onOpenChange}
        open={dialog === "ban"}
        title={t("admin.users.ban.title", { name })}
        tone="danger"
      />
      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.users.unban.action")}
        description={t("admin.users.unban.description")}
        onConfirm={confirmUnban}
        onOpenChange={onOpenChange}
        open={dialog === "unban"}
        title={t("admin.users.unban.title", { name })}
      />
      <AlertDialog
        body={
          <Field
            label={t("admin.users.delete.confirmLabel", { email: user.email })}
          >
            <Input
              autoCapitalize="none"
              autoComplete="off"
              onChange={onConfirmEmail}
              spellCheck={false}
              type="email"
              value={confirmEmail}
            />
          </Field>
        }
        className="wrap-anywhere"
        confirmDisabled={!emailMatches}
        confirmLabel={t("admin.users.delete.action")}
        description={t("admin.users.delete.description")}
        onConfirm={confirmDelete}
        onOpenChange={onOpenChange}
        open={dialog === "delete"}
        title={t("admin.users.delete.title", { name })}
        tone="danger"
      />
    </section>
  );
}

function PanelBody({
  actorId,
  onClose,
  userId,
}: {
  actorId: string;
  onClose: () => void;
  userId: string;
}): ReactNode {
  const { t } = useTranslation();
  const detail = useAdminUser(userId);
  const { refetch } = detail;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the user:", error);
    });
  }, [refetch]);

  if (detail.data) {
    return (
      <div className="flex flex-col gap-5">
        <UserFacts user={detail.data} />
        <UserActions
          isSelf={detail.data.id === actorId}
          onDeleted={onClose}
          user={detail.data}
        />
      </div>
    );
  }
  if (detail.isError) {
    const { code } = detail.error as { code?: unknown };
    return code === "NOT_FOUND" ? (
      <EmptyState
        action={
          <Button onClick={onClose} variant="secondary">
            {t("kit.close")}
          </Button>
        }
        icon={<UserX />}
        level={3}
        title={t("admin.users.panel.notFound")}
      />
    ) : (
      <ErrorState level={3} onRetry={retry} />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export interface UserPanelProps {
  /** The signed-in admin: their own account's actions are disabled. */
  actorId: string;
  /** The name to title the panel with while the detail loads. */
  name?: string | undefined;
  onClose: () => void;
  /** The account to show; the panel is closed while it is `null`. */
  userId: string | null;
}

/** The side panel of one account (`/admin/users?user=<id>`). */
export function UserPanel({
  actorId,
  name,
  onClose,
  userId,
}: UserPanelProps): ReactNode {
  const { t } = useTranslation();
  const detail = useAdminUser(userId);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  const title = detail.data?.name || detail.data?.email || name;
  return (
    <Sheet onOpenChange={onOpenChange} open={userId !== null}>
      {userId ? (
        <SheetContent
          className="wrap-anywhere"
          side="right"
          title={title ?? t("admin.users.title")}
        >
          <PanelBody actorId={actorId} onClose={onClose} userId={userId} />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
