import {
  useAdminCategories,
  useAdminGesture,
  useAdminGestureMutations,
  useAdminGestureNameCheck,
} from "@smog/admin/client";
import {
  type AdminGestureDetail,
  GESTURE_DESCRIPTION_MAX,
  GESTURE_NAME_MAX,
} from "@smog/admin/schema";
import { useDebouncedValue } from "@smog/gestures/client";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Switch,
  Text,
  Textarea,
  TextLink,
  useToast,
} from "@smog/ui-web";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, QrCode, Save, TriangleAlert } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { LeaveGuard } from "@/components/admin/leave-guard";
import {
  VideoField,
  type VideoFieldValue,
} from "@/components/admin/video/video-field";
import { GestureQrDialog } from "@/components/gesture-qr-dialog";
import { gestureHref } from "@/components/learning/links";
import { CategoryPicker, pickerCategories } from "./category-picker";
import { ConflictDialog, type EditorConflict } from "./editor-conflict";
import { conflictReason } from "./errors";
import {
  createInputOf,
  DRAFT_FIELDS,
  type DraftProblem,
  draftOf,
  draftProblems,
  EMPTY_DRAFT,
  type GestureDraft,
  mergeDrafts,
  patchOf,
  sameField,
  withMine,
} from "./gesture-draft";
import { KeywordInput } from "./keyword-input";

/** The duplicate-name check waits this long after the last keystroke. */
const NAME_CHECK_DELAY_MS = 300;

export interface GestureEditorProps {
  /** `null` for a new gesture. */
  gesture: AdminGestureDetail | null;
}

function DuplicateWarning({
  excludeId,
  name,
}: {
  excludeId: string | undefined;
  name: string;
}): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  const settled = useDebouncedValue(name.trim(), NAME_CHECK_DELAY_MS);
  const check = useAdminGestureNameCheck(settled, excludeId);
  const duplicates =
    settled === name.trim() ? (check.data?.duplicates ?? []) : [];
  return (
    // Always mounted, so the warning is announced when it appears.
    <div
      aria-labelledby={duplicates.length > 0 ? titleId : undefined}
      role="status"
    >
      {duplicates.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-subtle p-3 text-warning-strong">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <div className="flex flex-col gap-1 text-body-sm">
            <p className="font-medium" id={titleId}>
              {t("admin.gestures.editor.duplicateTitle")}
            </p>
            <p>
              {t("admin.gestures.editor.duplicate", {
                count: duplicates.length,
              })}{" "}
              {duplicates.map((duplicate, index) => (
                <span key={duplicate.id}>
                  {index > 0 ? ", " : null}
                  <TextLink asChild tone="default">
                    <Link
                      params={{ id: duplicate.id }}
                      target="_blank"
                      to="/admin/gestures/$id"
                    >
                      {duplicate.name}
                    </Link>
                  </TextLink>
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DangerZone({
  gesture,
  onLeave,
}: {
  gesture: AdminGestureDetail;
  /** Called before the delete navigates away (the leave guard lets it). */
  onLeave: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { remove } = useAdminGestureMutations();
  const [typed, setTyped] = useState("");
  const onTyped = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTyped(event.target.value),
    []
  );
  const reset = useCallback((open: boolean) => {
    if (!open) {
      setTyped("");
    }
  }, []);
  const confirm = useCallback(() => {
    remove
      .mutateAsync({ confirmName: typed.trim(), id: gesture.id })
      .then(() => {
        toast({
          title: t("admin.gestures.danger.deleted", { name: gesture.name }),
          variant: "success",
        });
        onLeave();
        return navigate({ to: "/admin/gestures" });
      })
      .catch((error: unknown) => {
        console.error("[admin] Failed to delete the gesture:", error);
        const reason = conflictReason(error);
        let title = t("admin.gestures.errors.saveFailed");
        if (reason === "sponsored") {
          title = t("admin.gestures.danger.sponsored");
        } else if (reason === "published") {
          title = t("admin.gestures.danger.publishedNote");
        }
        toast({ title, variant: "danger" });
      });
  }, [gesture.id, gesture.name, navigate, onLeave, remove, t, toast, typed]);
  const published = gesture.publishedAt !== null;
  return (
    <Card className="gap-3 border-danger sm:p-4">
      <CardContent className="gap-2">
        <CardTitle className="text-body" level={2}>
          {t("admin.gestures.danger.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("admin.gestures.danger.description")}
        </Text>
        {published ? (
          <Text size="body-sm">{t("admin.gestures.danger.publishedNote")}</Text>
        ) : (
          <div>
            <AlertDialog
              body={
                <Field label={t("admin.gestures.danger.confirmLabel")}>
                  <Input
                    autoComplete="off"
                    onChange={onTyped}
                    spellCheck={false}
                    value={typed}
                  />
                </Field>
              }
              confirmDisabled={typed.trim() !== gesture.name}
              confirmLabel={t("admin.gestures.danger.confirm")}
              description={t("admin.gestures.danger.confirmDescription", {
                name: gesture.name,
              })}
              loading={remove.isPending}
              onConfirm={confirm}
              onOpenChange={reset}
              title={t("admin.gestures.danger.confirmTitle", {
                name: gesture.name,
              })}
              tone="danger"
            >
              <Button variant="danger">
                {t("admin.gestures.danger.delete")}
              </Button>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCard({
  draft,
  gesture,
  onPublished,
}: {
  draft: GestureDraft;
  gesture: AdminGestureDetail | null;
  onPublished: (published: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [qrOpen, setQrOpen] = useState(false);
  const openQr = useCallback(() => setQrOpen(true), []);
  return (
    <Card className="gap-3 sm:p-4">
      <CardContent className="gap-3">
        <CardTitle className="text-body" level={2}>
          {t("admin.gestures.editor.status")}
        </CardTitle>
        <Switch
          checked={draft.published}
          description={t("admin.gestures.editor.publishedHint")}
          label={t("admin.gestures.editor.published")}
          onCheckedChange={onPublished}
        />
        {gesture ? (
          <>
            <div className="flex flex-col gap-1">
              <Text size="body-sm" weight="medium">
                {t("admin.gestures.editor.slug")}
              </Text>
              <Text className="break-all font-mono" size="body-sm">
                {gesture.slug}
              </Text>
              <Text size="caption" tone="muted">
                {t("admin.gestures.editor.slugHint")}
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {gesture.publishedAt === null ? (
                <Badge>{t("admin.gestures.hiddenBadge")}</Badge>
              ) : (
                <Button asChild variant="secondary">
                  <a
                    href={gestureHref(gesture.slug)}
                    rel="noopener"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="size-5" />
                    {t("admin.gestures.editor.viewOnSite")}
                  </a>
                </Button>
              )}
              <Button icon={<QrCode />} onClick={openQr} variant="secondary">
                {t("admin.gestures.qr")}
              </Button>
            </div>
            <GestureQrDialog
              gesture={gesture}
              note={
                gesture.publishedAt === null
                  ? t("admin.gestures.qrHiddenNote")
                  : undefined
              }
              onOpenChange={setQrOpen}
              open={qrOpen}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

const PROBLEM_KEYS = {
  categories: "admin.gestures.editor.categoriesRequired",
  description: "admin.gestures.editor.descriptionTooLong",
  name: "admin.gestures.editor.nameRequired",
  video: "admin.gestures.editor.videoRequired",
} as const satisfies Record<DraftProblem, TranslationKey>;

/** Auto-merged retries after a stale save, before giving up with a toast. */
const MERGE_RETRIES = 2;

/**
 * The gesture editor (A-16, A-17): the video (upload, pick or paste), the
 * name with its counter and a live duplicate warning, the description,
 * keywords, categories and the published switch. A save sends only the
 * changed fields with `expectedUpdatedAt`. A stale save is merged three
 * ways (C1): their changes to fields this admin did not touch are kept;
 * fields both changed open the diff dialog. An existing gesture shows its
 * fixed slug, "View on site", the QR code and, while hidden, the delete.
 * Leaving with unsaved edits asks first.
 */
export function GestureEditor({ gesture }: GestureEditorProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const categories = useAdminCategories();
  const current = useAdminGesture(gesture?.id);
  const { create, setPublished, update } = useAdminGestureMutations();
  // The version on the server this form is based on (`expectedUpdatedAt`).
  const [saved, setSaved] = useState<AdminGestureDetail | null>(gesture);
  const [draft, setDraft] = useState<GestureDraft>(() =>
    gesture ? draftOf(gesture) : EMPTY_DRAFT
  );
  const [tried, setTried] = useState(false);
  const [conflict, setConflict] = useState<
    (EditorConflict & { base: AdminGestureDetail; merged: GestureDraft }) | null
  >(null);

  const savedDraft = useMemo(
    () => (saved ? draftOf(saved) : EMPTY_DRAFT),
    [saved]
  );
  const dirty = DRAFT_FIELDS.some(
    (field) => !sameField(field, savedDraft, draft)
  );
  // Read at navigation time by the leave guard; set before a navigation
  // the editor makes itself (after create or delete).
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const leaving = useRef(false);
  const shouldBlock = useCallback(
    () => dirtyRef.current && !leaving.current,
    []
  );
  const allowLeave = useCallback(() => {
    leaving.current = true;
  }, []);
  const problems = draftProblems(draft);
  const shown = (problem: DraftProblem): string | undefined =>
    tried && problems.has(problem) ? t(PROBLEM_KEYS[problem]) : undefined;

  const set = useCallback(
    <K extends keyof GestureDraft>(key: K, value: GestureDraft[K]) =>
      setDraft((previous) => ({ ...previous, [key]: value })),
    []
  );
  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => set("name", event.target.value),
    [set]
  );
  const onDescription = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      set("description", event.target.value),
    [set]
  );
  const onKeywords = useCallback(
    (keywords: string[]) => set("keywords", keywords),
    [set]
  );
  const onCategories = useCallback(
    (ids: string[]) => set("categoryIds", ids),
    [set]
  );
  const onVideo = useCallback(
    (video: VideoFieldValue) => set("video", video),
    [set]
  );
  const onPublished = useCallback(
    (published: boolean) => set("published", published),
    [set]
  );

  const saveFailed = useCallback(
    (error: unknown) => {
      console.error("[admin] Failed to save the gesture:", error);
      toast({
        title: t("admin.gestures.errors.saveFailed"),
        variant: "danger",
      });
    },
    [t, toast]
  );

  /**
   * Saves `next` against `base`: the changed fields (`update`), then the
   * state (`setPublished`). The form is rebased after each step that
   * succeeded (I6), so a failed second step never makes the next save
   * conflict with this admin's own first step.
   */
  const persist = useCallback(
    async (base: AdminGestureDetail, next: GestureDraft): Promise<void> => {
      let latest = base;
      const patch = patchOf(draftOf(base), next);
      if (Object.keys(patch).length > 0) {
        latest = await update.mutateAsync({
          ...patch,
          expectedUpdatedAt: base.updatedAt,
          id: base.id,
        });
        setSaved(latest);
      }
      if (next.published !== (latest.publishedAt !== null)) {
        latest = await setPublished.mutateAsync({
          id: latest.id,
          published: next.published,
        });
        setSaved(latest);
      }
      setDraft(draftOf(latest));
      setTried(false);
    },
    [setPublished, update]
  );

  const { refetch } = current;
  /**
   * Saves, and on a stale save merges three ways with the newer version:
   * without a field both changed it saves the merge at once; otherwise it
   * opens the diff dialog and saves nothing.
   */
  const saveMerging = useCallback(
    async (
      base: AdminGestureDetail,
      mine: GestureDraft,
      retries: number
    ): Promise<"saved" | "merged" | "conflict"> => {
      try {
        await persist(base, mine);
        return "saved";
      } catch (error) {
        if (conflictReason(error) !== "stale" || retries === 0) {
          throw error;
        }
      }
      const { data: theirs } = await refetch();
      if (!theirs) {
        throw new Error("[admin] The newer version did not load");
      }
      const { conflicts, merged } = mergeDrafts(
        draftOf(base),
        mine,
        draftOf(theirs)
      );
      if (conflicts.length > 0) {
        setConflict({
          base: theirs,
          conflicts,
          merged,
          mine,
          theirs: draftOf(theirs),
          theirsAt: theirs.updatedAt,
        });
        return "conflict";
      }
      setSaved(theirs);
      setDraft(merged);
      const outcome = await saveMerging(theirs, merged, retries - 1);
      return outcome === "saved" ? "merged" : outcome;
    },
    [persist, refetch]
  );

  const save = useCallback(async (): Promise<void> => {
    if (!saved) {
      const { video } = draft;
      if (!video) {
        return;
      }
      const created = await create.mutateAsync(
        createInputOf({ ...draft, video })
      );
      toast({
        title: t("admin.gestures.editor.created", { name: created.name }),
        variant: "success",
      });
      allowLeave();
      await navigate({
        params: { id: created.id },
        to: "/admin/gestures/$id",
      });
      return;
    }
    const outcome = await saveMerging(saved, draft, MERGE_RETRIES);
    if (outcome === "saved") {
      toast({ title: t("admin.gestures.editor.saved"), variant: "success" });
    } else if (outcome === "merged") {
      toast({ title: t("admin.gestures.conflict.merged"), variant: "success" });
    }
  }, [allowLeave, create, draft, navigate, saveMerging, saved, t, toast]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setTried(true);
      if (draftProblems(draft).size > 0) {
        return;
      }
      save().catch(saveFailed);
    },
    [draft, save, saveFailed]
  );

  const cancelConflict = useCallback(() => setConflict(null), []);
  const takeTheirs = useCallback(() => {
    if (!conflict) {
      return;
    }
    setSaved(conflict.base);
    setDraft(conflict.merged);
    setConflict(null);
  }, [conflict]);
  const overwrite = useCallback(() => {
    if (!conflict) {
      return;
    }
    const mine = withMine(conflict.merged, conflict.mine, conflict.conflicts);
    setSaved(conflict.base);
    setDraft(mine);
    setConflict(null);
    persist(conflict.base, mine)
      .then(() =>
        toast({ title: t("admin.gestures.editor.saved"), variant: "success" })
      )
      .catch(saveFailed);
  }, [conflict, persist, saveFailed, t, toast]);

  const busy = create.isPending || update.isPending || setPublished.isPending;
  const title = saved ? saved.name : t("admin.gestures.editor.newTitle");

  return (
    <AdminPage
      description={
        <TextLink asChild tone="muted">
          <Link to="/admin/gestures">{t("admin.gestures.editor.back")}</Link>
        </TextLink>
      }
      title={title}
    >
      <form
        className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        noValidate
        onSubmit={submit}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <VideoField onChange={onVideo} value={draft.video} />
            {shown("video") ? (
              <p className="text-body-sm text-danger-strong" role="alert">
                {shown("video")}
              </p>
            ) : null}
          </div>
          <div className="flex max-w-reading flex-col gap-2">
            <Field
              counter={{
                count: draft.name.trim().length,
                max: GESTURE_NAME_MAX,
              }}
              error={shown("name")}
              label={t("admin.gestures.fields.name")}
              required
            >
              <Input autoComplete="off" onChange={onName} value={draft.name} />
            </Field>
            <DuplicateWarning excludeId={saved?.id} name={draft.name} />
          </div>
          <Field
            className="max-w-reading"
            counter={{
              count: draft.description.trim().length,
              max: GESTURE_DESCRIPTION_MAX,
            }}
            error={shown("description")}
            label={t("admin.gestures.fields.description")}
            optional
          >
            <Textarea
              onChange={onDescription}
              rows={4}
              value={draft.description}
            />
          </Field>
          <div className="max-w-reading">
            <KeywordInput
              label={t("admin.gestures.fields.keywords")}
              onChange={onKeywords}
              value={draft.keywords}
            />
          </div>
          {categories.data ? (
            <CategoryPicker
              categories={pickerCategories(categories.data)}
              error={shown("categories")}
              hint={t("admin.gestures.editor.categoriesHint")}
              label={t("admin.gestures.fields.categoryIds")}
              onChange={onCategories}
              value={draft.categoryIds}
            />
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saved !== null && !dirty}
              icon={<Save />}
              loading={busy}
              type="submit"
            >
              {saved
                ? t("admin.gestures.editor.save")
                : t("admin.gestures.editor.create")}
            </Button>
          </div>
        </div>
        {/* Phones: the status first, the danger zone last; lg: a side column. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-first lg:order-none">
            <StatusCard
              draft={draft}
              gesture={saved}
              onPublished={onPublished}
            />
          </div>
          {saved ? <DangerZone gesture={saved} onLeave={allowLeave} /> : null}
        </div>
      </form>
      <ConflictDialog
        categories={categories.data ?? []}
        conflict={conflict}
        onCancel={cancelConflict}
        onOverwrite={overwrite}
        onUseTheirs={takeTheirs}
      />
      <LeaveGuard shouldBlock={shouldBlock} />
    </AdminPage>
  );
}
