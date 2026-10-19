import {
  sponsorshipRefusalOf,
  useAdminSponsorshipActions,
  useRetryRender,
  useRetryRenderPending,
} from "@smog/admin/client";
import type { AdminPayment, AdminSponsorshipDetail } from "@smog/admin/schema";
import type { SponsorshipStatus } from "@smog/db/enums";
import { formatDate, formatList, type TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  MARK_PAID_NOTE_MAX,
  REJECTION_REASON_MAX,
} from "@smog/sponsorships/schema";
import {
  AlertDialog,
  Button,
  Field,
  Input,
  Text,
  Textarea,
  type ToastOptions,
  useToast,
} from "@smog/ui-web";
import {
  Ban,
  Banknote,
  Check,
  Link2,
  MessageSquareWarning,
  ReceiptText,
  RotateCcw,
  TimerOff,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { sponsorshipActionError, useMoney, usePageLocale } from "./labels";
import { type ShownLink, TokenDialog } from "./token-dialog";

/** One year from now, the end approve sets (ruling 14). */
const LIVE_DAYS = 365;
const DAY_MS = 86_400_000;

/** The statuses each sponsorship action starts from (ruling 14). */
const FROM = {
  approve: ["in_review"],
  forceExpire: ["live", "expiring"],
  reject: ["in_review", "changes_requested"],
  requestChanges: ["in_review", "rejected"],
} as const satisfies Record<string, readonly SponsorshipStatus[]>;

/** Which link "New link" makes, per status (re-edit or renewal). */
const REGENERATE = {
  changes_requested: "reedit",
  expiring: "renewal",
} as const;

/** Why there is nothing to do here, for the statuses without actions. */
const IDLE_NOTES: Partial<Record<SponsorshipStatus, TranslationKey>> = {
  awaiting_payment: "admin.sponsorships.actions.notes.awaitingPayment",
  cancelled: "admin.sponsorships.actions.notes.closed",
  expired: "admin.sponsorships.actions.notes.closed",
  render_failed: "admin.sponsorships.actions.notes.renderFailed",
  rendering: "admin.sponsorships.actions.notes.rendering",
};

function can(
  allowed: readonly SponsorshipStatus[],
  status: SponsorshipStatus
): boolean {
  return allowed.includes(status);
}

/** This sponsorship's own amount: its item on the checkout payment. */
export function sponsorshipAmountCents(
  detail: AdminSponsorshipDetail
): number | null {
  for (const payment of detail.payments) {
    if (payment.kind !== "initial") {
      continue;
    }
    const item = payment.items.find(
      (entry) => entry.sponsorshipId === detail.sponsorship.id
    );
    if (item) {
      return item.amountCents;
    }
  }
  return null;
}

/** Runs an action: the toast on success, the reason on a refusal. */
function useRun() {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(
    async <T,>(
      what: string,
      action: () => Promise<T>,
      done: (result: T) => ToastOptions,
      failed?: (error: unknown) => Promise<ToastOptions | null>
    ): Promise<T | null> => {
      try {
        const result = await action();
        toast(done(result));
        return result;
      } catch (error) {
        console.error(`[admin] Failed to ${what}:`, error);
        const special = failed ? await failed(error) : null;
        toast(
          special ?? {
            title: sponsorshipActionError(t, error),
            variant: "danger",
          }
        );
        return null;
      }
    },
    [t, toast]
  );
}

type SponsorshipDialog =
  | "approve"
  | "forceExpire"
  | "regenerate"
  | "reject"
  | "requestChanges";

/**
 * The moderation actions of one sponsorship (A-05–A-07, A-12), shown by
 * status, each behind an AlertDialog that names the sponsorship and its
 * amount, then a toast; every action refetches the admin queries. Request
 * changes and a new link show the link once (`TokenDialog`). The server
 * runs the same guards: a lost race answers `stale`.
 */
export function SponsorshipActions({
  detail,
}: {
  detail: AdminSponsorshipDetail;
}): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const locale = usePageLocale();
  const actions = useAdminSponsorshipActions();
  const run = useRun();
  const [dialog, setDialog] = useState<SponsorshipDialog | null>(null);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [link, setLink] = useState<ShownLink | null>(null);
  const noteId = useId();

  const { gesture, sponsorship } = detail;
  const { id, status } = sponsorship;
  const name = sponsorship.displayName;
  const cents = sponsorshipAmountCents(detail);
  const amount =
    cents === null ? t("admin.sponsorships.amountUnknown") : money(cents);
  const named = { amount, gesture: gesture.name, name };
  const noVideo = detail.video.playbackId === null;
  const purpose =
    status === "changes_requested" || status === "expiring"
      ? REGENERATE[status]
      : null;

  const open = useCallback((kind: SponsorshipDialog) => {
    setReason("");
    setConfirmName("");
    setDialog(kind);
  }, []);
  const openApprove = useCallback(() => open("approve"), [open]);
  const openReject = useCallback(() => open("reject"), [open]);
  const openRequest = useCallback(() => open("requestChanges"), [open]);
  const openRegenerate = useCallback(() => open("regenerate"), [open]);
  const openExpire = useCallback(() => open("forceExpire"), [open]);
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDialog(null);
    }
  }, []);
  const closeLink = useCallback(() => setLink(null), []);
  const onReason = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value),
    []
  );
  const onConfirmName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setConfirmName(event.target.value),
    []
  );

  const approve = useCallback(() => {
    run(
      `approve sponsorship ${id}`,
      () => actions.approve.mutateAsync({ id }),
      () => ({
        title: t("admin.sponsorships.approve.done", { name }),
        variant: "success",
      })
    ).catch(() => undefined);
  }, [actions.approve, id, name, run, t]);

  const reject = useCallback(() => {
    run(
      `reject sponsorship ${id}`,
      () => actions.reject.mutateAsync({ id, reason: reason.trim() }),
      () => ({
        title: t("admin.sponsorships.reject.done", { name }),
        variant: "success",
      })
    ).catch(() => undefined);
  }, [actions.reject, id, name, reason, run, t]);

  const requestChanges = useCallback(() => {
    run(
      `request changes for sponsorship ${id}`,
      () => actions.requestChanges.mutateAsync({ id }),
      () => ({
        title: t("admin.sponsorships.requestChanges.done"),
        variant: "success",
      })
    )
      .then((result) => {
        if (result) {
          setLink({ ...result, purpose: "reedit" });
          // The link stays in this state only, not in the mutation's.
          actions.requestChanges.reset();
        }
      })
      .catch(() => undefined);
  }, [actions.requestChanges, id, run, t]);

  const regenerate = useCallback(() => {
    if (!purpose) {
      return;
    }
    run(
      `regenerate the ${purpose} link of sponsorship ${id}`,
      () => actions.regenerateToken.mutateAsync({ id, purpose }),
      () => ({
        title: t("admin.sponsorships.regenerate.done"),
        variant: "success",
      })
    )
      .then((result) => {
        if (result) {
          setLink({ ...result, purpose });
          actions.regenerateToken.reset();
        }
      })
      .catch(() => undefined);
  }, [actions.regenerateToken, id, purpose, run, t]);

  const forceExpire = useCallback(() => {
    run(
      `force expire sponsorship ${id}`,
      () =>
        actions.forceExpire.mutateAsync({
          confirmName: confirmName.trim(),
          id,
        }),
      () => ({
        title: t("admin.sponsorships.forceExpire.done", { name }),
        variant: "success",
      })
    ).catch(() => undefined);
  }, [actions.forceExpire, confirmName, id, name, run, t]);

  const busy = [
    actions.approve,
    actions.reject,
    actions.requestChanges,
    actions.regenerateToken,
    actions.forceExpire,
  ].some((action) => action.isPending);
  const nameMatches =
    confirmName.trim().toLowerCase() === gesture.name.toLowerCase();
  const idle = IDLE_NOTES[status];
  const liveUntil = formatDate(Date.now() + LIVE_DAYS * DAY_MS, locale, {
    dateStyle: "long",
  });

  return (
    <section
      aria-labelledby="sponsorship-actions-heading"
      className="flex flex-col gap-3"
    >
      <h2 className="sr-only" id="sponsorship-actions-heading">
        {t("admin.sponsorships.actions.title")}
      </h2>
      {idle ? (
        <Text size="body-sm" tone="muted">
          {t(idle)}
        </Text>
      ) : null}
      <RetryRender detail={detail} />
      {status === "in_review" && noVideo ? (
        <Text id={noteId} size="body-sm" tone="muted">
          {t("admin.sponsorships.approve.noVideo")}
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {can(FROM.approve, status) ? (
          <Button
            aria-describedby={noVideo ? noteId : undefined}
            disabled={busy || noVideo}
            icon={<Check />}
            loading={actions.approve.isPending}
            onClick={openApprove}
          >
            {t("admin.sponsorships.approve.action")}
          </Button>
        ) : null}
        {can(FROM.requestChanges, status) ? (
          <Button
            disabled={busy}
            icon={<MessageSquareWarning />}
            loading={actions.requestChanges.isPending}
            onClick={openRequest}
            variant="secondary"
          >
            {t("admin.sponsorships.requestChanges.action")}
          </Button>
        ) : null}
        {purpose ? (
          <Button
            disabled={busy}
            icon={<Link2 />}
            loading={actions.regenerateToken.isPending}
            onClick={openRegenerate}
            variant="secondary"
          >
            {t(
              purpose === "reedit"
                ? "admin.sponsorships.regenerate.reeditAction"
                : "admin.sponsorships.regenerate.renewalAction"
            )}
          </Button>
        ) : null}
        {can(FROM.reject, status) ? (
          <Button
            disabled={busy}
            icon={<X />}
            loading={actions.reject.isPending}
            onClick={openReject}
            variant="danger"
          >
            {t("admin.sponsorships.reject.action")}
          </Button>
        ) : null}
        {can(FROM.forceExpire, status) ? (
          <Button
            disabled={busy}
            icon={<TimerOff />}
            loading={actions.forceExpire.isPending}
            onClick={openExpire}
            variant="danger"
          >
            {t("admin.sponsorships.forceExpire.action")}
          </Button>
        ) : null}
      </div>

      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.approve.action")}
        description={t("admin.sponsorships.approve.description", {
          ...named,
          date: liveUntil,
        })}
        onConfirm={approve}
        onOpenChange={onOpenChange}
        open={dialog === "approve"}
        title={t("admin.sponsorships.approve.title", named)}
      />
      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.requestChanges.action")}
        description={t("admin.sponsorships.requestChanges.description")}
        onConfirm={requestChanges}
        onOpenChange={onOpenChange}
        open={dialog === "requestChanges"}
        title={t("admin.sponsorships.requestChanges.title", named)}
      />
      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.regenerate.confirm")}
        description={t(
          purpose === "renewal"
            ? "admin.sponsorships.regenerate.renewalDescription"
            : "admin.sponsorships.regenerate.reeditDescription"
        )}
        onConfirm={regenerate}
        onOpenChange={onOpenChange}
        open={dialog === "regenerate"}
        title={t(
          purpose === "renewal"
            ? "admin.sponsorships.regenerate.renewalTitle"
            : "admin.sponsorships.regenerate.reeditTitle",
          named
        )}
      />
      <AlertDialog
        body={
          <Field
            counter={{ count: reason.trim().length, max: REJECTION_REASON_MAX }}
            hint={t("admin.sponsorships.reject.reasonHint")}
            label={t("admin.sponsorships.reject.reason")}
            required
          >
            <Textarea
              maxLength={REJECTION_REASON_MAX}
              onChange={onReason}
              rows={3}
              value={reason}
            />
          </Field>
        }
        className="wrap-anywhere"
        confirmDisabled={reason.trim().length === 0}
        confirmLabel={t("admin.sponsorships.reject.action")}
        description={t("admin.sponsorships.reject.description", named)}
        onConfirm={reject}
        onOpenChange={onOpenChange}
        open={dialog === "reject"}
        title={t("admin.sponsorships.reject.title", named)}
        tone="danger"
      />
      <AlertDialog
        body={
          <Field
            label={t("admin.sponsorships.forceExpire.confirmLabel", named)}
          >
            <Input
              autoCapitalize="none"
              autoComplete="off"
              onChange={onConfirmName}
              spellCheck={false}
              value={confirmName}
            />
          </Field>
        }
        className="wrap-anywhere"
        confirmDisabled={!nameMatches}
        confirmLabel={t("admin.sponsorships.forceExpire.action")}
        description={t("admin.sponsorships.forceExpire.description", named)}
        onConfirm={forceExpire}
        onOpenChange={onOpenChange}
        open={dialog === "forceExpire"}
        title={t("admin.sponsorships.forceExpire.title", named)}
        tone="danger"
      />
      <TokenDialog link={link} name={name} onClose={closeLink} />
    </section>
  );
}

/**
 * Retry a failed render (A-27, A-15): on a `render_failed` sponsorship, a
 * button behind a confirm dialog, then a toast and a polite live-region
 * announcement. Shown in the status card and in the render jobs section.
 * Focus returns to the button when the dialog closes; once the refetched
 * detail has moved on (the button is gone), it moves to the announcement,
 * then shown in the button's place, instead of falling back to the page.
 */
export function RetryRender({
  detail,
}: {
  detail: AdminSponsorshipDetail;
}): ReactNode {
  const { t } = useTranslation();
  const retry = useRetryRender();
  const anyPending = useRetryRenderPending();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const region = useRef<HTMLParagraphElement>(null);
  const retried = useRef(false);

  const { gesture, sponsorship } = detail;
  const { id, status } = sponsorship;
  const name = sponsorship.displayName;
  const failed = status === "render_failed";

  useEffect(() => {
    if (failed || !retried.current) {
      return;
    }
    retried.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      region.current?.focus();
    }
  }, [failed]);

  const openDialog = useCallback(() => setOpen(true), []);
  const onOpenChange = useCallback((next: boolean) => setOpen(next), []);
  const confirm = useCallback(() => {
    run(
      `retry the render of sponsorship ${id}`,
      () => retry.mutateAsync({ id }),
      (result) => {
        retried.current = true;
        setAnnouncement(
          t("admin.sponsorships.retryRender.announce", {
            attempt: result.attempt,
            name,
          })
        );
        return {
          title: t("admin.sponsorships.retryRender.done", {
            attempt: result.attempt,
          }),
          variant: "success",
        };
      }
    ).catch(() => undefined);
  }, [id, name, retry, run, t]);

  return (
    <>
      {failed ? (
        <div>
          <Button
            disabled={anyPending && !retry.isPending}
            icon={<RotateCcw />}
            loading={retry.isPending}
            onClick={openDialog}
            variant="secondary"
          >
            {t("admin.sponsorships.retryRender.action")}
          </Button>
        </div>
      ) : null}
      {/* Only where it can speak: on a failed render (ready before the
          announcement, so it is read), and after a retry. Once the button
          is gone the announcement shows, so the focus it gets is visible
          (WCAG 2.4.7, review M-7). */}
      {failed || announcement ? (
        <p
          aria-live="polite"
          className={
            failed
              ? "sr-only"
              : "rounded-sm text-body-sm text-foreground-muted focus:outline-2 focus:outline-focus-ring focus:outline-offset-2"
          }
          ref={region}
          role="status"
          tabIndex={-1}
        >
          {announcement}
        </p>
      ) : null}
      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.retryRender.action")}
        description={t("admin.sponsorships.retryRender.description")}
        onConfirm={confirm}
        onOpenChange={onOpenChange}
        open={open && failed}
        title={t("admin.sponsorships.retryRender.title", {
          gesture: gesture.name,
          name,
        })}
      />
    </>
  );
}

type PaymentDialog = "cancel" | "markPaid" | "recordRefund";

export interface PaymentActionsProps {
  /**
   * The sponsor's display name, for the dialogs (a payment's sponsorships
   * share one checkout and one sponsor).
   */
  name: string;
  payment: AdminPayment;
  /** Reads the detail again (after a mark paid that failed late). */
  reload: () => Promise<AdminSponsorshipDetail | undefined>;
}

const MARK_PAID_DONE = {
  marked_paid: "admin.sponsorships.markPaid.done",
  settled: "admin.sponsorships.markPaid.settled",
} as const satisfies Record<string, TranslationKey>;

/**
 * The payment actions (A-10, A-11, ruling 4): mark paid and cancel act on
 * the whole payment, so their dialogs name every gesture it covers and its
 * amount; record refund reads what Mollie refunded.
 */
export function PaymentActions({
  name,
  payment,
  reload,
}: PaymentActionsProps): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const locale = usePageLocale();
  const actions = useAdminSponsorshipActions();
  const run = useRun();
  const [dialog, setDialog] = useState<PaymentDialog | null>(null);
  const [note, setNote] = useState("");

  const paymentId = payment.id;
  const amount = money(payment.amountCents);
  const gestures = formatList(
    payment.items.map((item) => item.gesture.name),
    locale
  );
  const named = { amount, count: payment.items.length, gestures, name };
  const isOpen = payment.status === "open";
  const canRecordRefund =
    payment.mollieId !== null &&
    (payment.status === "paid" || payment.status === "refund_needed") &&
    !payment.refunded;

  const openMarkPaid = useCallback(() => {
    setNote("");
    setDialog("markPaid");
  }, []);
  const openCancel = useCallback(() => setDialog("cancel"), []);
  const openRefund = useCallback(() => setDialog("recordRefund"), []);
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDialog(null);
    }
  }, []);
  const onNote = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value),
    []
  );

  /**
   * Mark paid commits first and fails loudly when the render cannot be
   * started (the hourly check is the backstop). After a failure that is not
   * a refusal the payment is read again: `paid` is that case,
   * `refund_needed` is Mollie's settlement flagging it, and anything else
   * (still open, or cancelled by another write) is a plain error. The
   * warnings stay until dismissed: this is the case meant to be loud.
   */
  const markedPaidLate = useCallback(
    async (error: unknown): Promise<ToastOptions | null> => {
      if (sponsorshipRefusalOf(error)) {
        return null;
      }
      try {
        const fresh = await reload();
        const now = fresh?.payments.find((entry) => entry.id === paymentId);
        if (now?.status === "paid") {
          return {
            duration: Number.POSITIVE_INFINITY,
            title: t("admin.sponsorships.markPaid.lateFailure"),
            variant: "warning",
          };
        }
        if (now?.status === "refund_needed") {
          return {
            duration: Number.POSITIVE_INFINITY,
            title: t("admin.sponsorships.markPaid.refundNeeded"),
            variant: "warning",
          };
        }
        return null;
      } catch (reloadError) {
        console.error("[admin] Failed to reload the sponsorship:", reloadError);
        return null;
      }
    },
    [paymentId, reload, t]
  );

  const markPaid = useCallback(() => {
    const trimmed = note.trim();
    run(
      `mark payment ${paymentId} paid`,
      () =>
        actions.markPaid.mutateAsync({
          paymentId,
          ...(trimmed ? { note: trimmed } : {}),
        }),
      (result) =>
        result.result === "refund_needed"
          ? {
              duration: Number.POSITIVE_INFINITY,
              title: t("admin.sponsorships.markPaid.refundNeeded"),
              variant: "warning",
            }
          : {
              title: t(
                result.result === "settled"
                  ? MARK_PAID_DONE.settled
                  : MARK_PAID_DONE.marked_paid
              ),
              variant: "success",
            },
      markedPaidLate
    ).catch(() => undefined);
  }, [actions.markPaid, markedPaidLate, note, paymentId, run, t]);

  const cancel = useCallback(() => {
    run(
      `cancel payment ${paymentId}`,
      () => actions.cancel.mutateAsync({ paymentId }),
      () => ({
        title: t("admin.sponsorships.cancel.done", { gestures }),
        variant: "success",
      })
    ).catch(() => undefined);
  }, [actions.cancel, gestures, paymentId, run, t]);

  const recordRefund = useCallback(() => {
    run(
      `record the refund of payment ${paymentId}`,
      () => actions.recordRefund.mutateAsync({ paymentId }),
      (result) => ({
        title: t("admin.sponsorships.recordRefund.done", {
          amount: money(result.refundedCents),
        }),
        variant: "success",
      })
    ).catch(() => undefined);
  }, [actions.recordRefund, money, paymentId, run, t]);

  if (!(isOpen || canRecordRefund)) {
    return null;
  }
  const busy = [actions.markPaid, actions.cancel, actions.recordRefund].some(
    (action) => action.isPending
  );
  return (
    <div className="flex flex-wrap gap-2">
      {isOpen ? (
        <>
          <Button
            disabled={busy}
            icon={<Banknote />}
            loading={actions.markPaid.isPending}
            onClick={openMarkPaid}
            size="sm"
          >
            {t("admin.sponsorships.markPaid.action")}
          </Button>
          <Button
            disabled={busy}
            icon={<Ban />}
            loading={actions.cancel.isPending}
            onClick={openCancel}
            size="sm"
            variant="danger"
          >
            {t("admin.sponsorships.cancel.action")}
          </Button>
        </>
      ) : null}
      {canRecordRefund ? (
        <Button
          disabled={busy}
          icon={<ReceiptText />}
          loading={actions.recordRefund.isPending}
          onClick={openRefund}
          size="sm"
          variant="secondary"
        >
          {t("admin.sponsorships.recordRefund.action")}
        </Button>
      ) : null}

      <AlertDialog
        body={
          <Field
            hint={t("admin.sponsorships.markPaid.noteHint")}
            label={t("admin.sponsorships.markPaid.note")}
            optional
          >
            <Input
              autoComplete="off"
              maxLength={MARK_PAID_NOTE_MAX}
              onChange={onNote}
              value={note}
            />
          </Field>
        }
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.markPaid.action")}
        description={t("admin.sponsorships.markPaid.description", named)}
        onConfirm={markPaid}
        onOpenChange={onOpenChange}
        open={dialog === "markPaid"}
        title={t("admin.sponsorships.markPaid.title", named)}
        tone="danger"
      />
      <AlertDialog
        cancelLabel={t("admin.sponsorships.cancel.keep")}
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.cancel.action")}
        description={t("admin.sponsorships.cancel.description", named)}
        onConfirm={cancel}
        onOpenChange={onOpenChange}
        open={dialog === "cancel"}
        title={t("admin.sponsorships.cancel.title", named)}
        tone="danger"
      />
      <AlertDialog
        className="wrap-anywhere"
        confirmLabel={t("admin.sponsorships.recordRefund.action")}
        description={t("admin.sponsorships.recordRefund.description", named)}
        onConfirm={recordRefund}
        onOpenChange={onOpenChange}
        open={dialog === "recordRefund"}
        title={t("admin.sponsorships.recordRefund.title", named)}
        tone="danger"
      />
    </div>
  );
}
