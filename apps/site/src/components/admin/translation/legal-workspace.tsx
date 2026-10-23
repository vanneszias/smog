import { useAuthState } from "@smog/auth/react";
import { ensureCatalogues } from "@smog/i18n";
import {
  LEGAL_CANONICAL_LOCALE,
  type LegalDocument,
  type LegalKind,
  validateLegalDocument,
} from "@smog/i18n/legal/markup";
import { useTranslation } from "@smog/i18n/react";
import {
  legalConflictOf,
  legalIssuesOf,
  useLegalActions,
  useLegalDetail,
  useLegalVersion,
} from "@smog/translation/client";
import type { LegalDetail, LegalVersion } from "@smog/translation/schema";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  useToast,
} from "@smog/ui-web";
import { Eye, RotateCcw, Save, Send } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LegalDocumentView } from "@/components/legal-page";
import { useLocale } from "@/lib/locale";
import { LegalEditor } from "./legal-editor";

const EMPTY: LegalDocument = { sections: [], title: "" };

/** What the editor loads for a stored text: a valid document, or an empty one when the row cannot be read. */
function documentOf(kind: LegalKind, content: unknown): LegalDocument | null {
  if (content === null || content === undefined) {
    return null;
  }
  return validateLegalDocument(kind, content).document;
}

const today = (): string => new Date().toISOString().slice(0, 10);

function sameDocument(a: LegalDocument | null, b: LegalDocument | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface DateDialogProps {
  confirmLabel: string;
  description: string;
  onConfirm: (effectiveDate: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  title: string;
}

/** Asks for the effective date, then confirms (publish and restore both change what every visitor reads). */
function DateDialog({
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  pending,
  title,
}: DateDialogProps): ReactNode {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value),
    []
  );
  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onConfirm(date);
    },
    [date, onConfirm]
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent description={description} title={title}>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field
            hint={t("admin.translation.legal.effectiveHint")}
            label={t("admin.translation.legal.effectiveDate")}
            required
          >
            <Input onChange={onChange} type="date" value={date} />
          </Field>
          <DialogFooter>
            <Button loading={pending} type="submit">
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VersionPreview({
  kind,
  locale,
  onClose,
  version,
}: {
  kind: LegalKind;
  locale: string;
  onClose: () => void;
  version: LegalVersion | null;
}): ReactNode {
  const { t } = useTranslation();
  const stored = useLegalVersion({ kind, locale }, version?.version ?? null);
  const doc = documentOf(kind, stored.data?.content);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={version !== null}>
      <DialogContent
        className="max-w-4xl"
        description={t("admin.translation.legal.previewVersionDescription")}
        title={t("admin.translation.legal.previewVersion", {
          version: version?.version ?? 0,
        })}
      >
        <div className="max-h-[70vh] overflow-auto">
          {doc && version ? (
            <LegalDocumentView
              contentsId="legal-version-contents"
              doc={doc}
              effectiveDate={version.effectiveDate}
              locale={locale}
              preview
            />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryRow({
  isAdmin,
  isCurrent,
  onPreview,
  onRestore,
  version,
}: {
  isAdmin: boolean;
  isCurrent: boolean;
  onPreview: (version: LegalVersion) => void;
  onRestore: (version: LegalVersion) => void;
  version: LegalVersion;
}): ReactNode {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const preview = useCallback(() => onPreview(version), [onPreview, version]);
  const restore = useCallback(() => onRestore(version), [onRestore, version]);
  return (
    <TableRow data-testid={`legal-version-${version.version}`}>
      <TableCell>
        <Text as="span" weight="semibold">
          {t("admin.translation.legal.versionNumber", {
            version: version.version,
          })}
        </Text>{" "}
        {isCurrent ? (
          <Badge variant="success">
            {t("admin.translation.legal.current")}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>{version.effectiveDate}</TableCell>
      <TableCell>
        {version.publishedBy ?? t("admin.translation.legal.shipped")}
      </TableCell>
      <TableCell>
        {version.publishedAt > 0
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(version.publishedAt)
          : "-"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-label={t("admin.translation.legal.previewLabel", {
              version: version.version,
            })}
            icon={<Eye />}
            onClick={preview}
            size="sm"
            variant="ghost"
          >
            {t("admin.translation.legal.preview")}
          </Button>
          {isAdmin && !isCurrent ? (
            <Button
              aria-label={t("admin.translation.legal.restoreLabel", {
                version: version.version,
              })}
              icon={<RotateCcw />}
              onClick={restore}
              size="sm"
              variant="ghost"
            >
              {t("admin.translation.legal.restore")}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** The three writes. They live in the parent, which stays mounted when a new published version restarts the editor, so their result callbacks still run. */
type LegalActions = ReturnType<typeof useLegalActions>;

interface WorkspaceBodyProps {
  actions: LegalActions;
  detail: LegalDetail;
  kind: LegalKind;
  locale: string;
}

function WorkspaceBody({
  actions,
  detail,
  kind,
  locale,
}: WorkspaceBodyProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthState();
  const isAdmin = user?.roles.includes("admin") ?? false;
  const { publish, restore, save } = actions;
  const stored = useMemo(
    () => documentOf(kind, detail.draft?.content),
    [detail.draft?.content, kind]
  );
  const published = useMemo(
    () => documentOf(kind, detail.published?.content),
    [detail.published?.content, kind]
  );
  const canonical = useMemo(
    () => documentOf(kind, detail.canonical),
    [detail.canonical, kind]
  );
  // The start: the draft, else the published text, else (a new language) the Dutch text to translate.
  const [doc, setDoc] = useState<LegalDocument>(
    () => stored ?? published ?? canonical ?? EMPTY
  );
  // The text a save is compared with: the draft, else the published text.
  const [serverIssues, setServerIssues] = useState<
    { code: string; path: string }[]
  >([]);
  const [conflict, setConflict] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState<LegalVersion | null>(null);
  const [previewing, setPreviewing] = useState<LegalVersion | null>(null);
  const baseline = stored ?? published;
  const dirty = baseline === null || !sameDocument(doc, baseline);
  const issues = useMemo(
    () => validateLegalDocument(kind, doc).issues,
    [doc, kind]
  );
  const onChange = useCallback((next: LegalDocument) => {
    setDoc(next);
    setServerIssues([]);
  }, []);
  const onSave = useCallback(() => {
    save.mutate(
      {
        content: doc,
        expectedUpdatedAt: detail.draft?.updatedAt ?? null,
        kind,
        locale,
      },
      {
        onError: (error) => {
          if (legalConflictOf(error)) {
            setConflict(true);
            return;
          }
          const refused = legalIssuesOf(error);
          if (refused.length > 0) {
            setServerIssues(refused);
            return;
          }
          toast({
            title: t("admin.translation.legal.errors.failed"),
            variant: "danger",
          });
        },
        onSuccess: () => {
          setConflict(false);
          toast({
            title: t("admin.translation.legal.draftSaved"),
            variant: "success",
          });
        },
      }
    );
  }, [detail.draft?.updatedAt, doc, kind, locale, save, t, toast]);
  const onReset = useCallback(() => {
    setDoc(baseline ?? canonical ?? EMPTY);
    setServerIssues([]);
  }, [baseline, canonical]);
  const onTakeStored = useCallback(() => {
    setDoc(stored ?? published ?? EMPTY);
    setConflict(false);
  }, [published, stored]);
  const onPublish = useCallback(
    (effectiveDate: string) => {
      if (!detail.draft) {
        return;
      }
      publish.mutate(
        {
          effectiveDate,
          expectedUpdatedAt: detail.draft.updatedAt,
          kind,
          locale,
        },
        {
          onError: (error) => {
            setPublishing(false);
            if (legalConflictOf(error)) {
              setConflict(true);
              return;
            }
            toast({
              title: t("admin.translation.legal.errors.failed"),
              variant: "danger",
            });
          },
          onSuccess: (result) => {
            setPublishing(false);
            toast({
              title: t("admin.translation.legal.published", {
                version: result.version,
              }),
              variant: "success",
            });
          },
        }
      );
    },
    [detail.draft, kind, locale, publish, t, toast]
  );
  const onRestore = useCallback(
    (effectiveDate: string) => {
      if (!restoring) {
        return;
      }
      restore.mutate(
        { effectiveDate, kind, locale, version: restoring.version },
        {
          onError: () => {
            setRestoring(null);
            toast({
              title: t("admin.translation.legal.errors.failed"),
              variant: "danger",
            });
          },
          onSuccess: (result) => {
            setRestoring(null);
            toast({
              title: t("admin.translation.legal.restored", {
                version: result.version,
              }),
              variant: "success",
            });
          },
        }
      );
    },
    [kind, locale, restore, restoring, t, toast]
  );
  const closePublish = useCallback(() => setPublishing(false), []);
  const openPublish = useCallback(() => setPublishing(true), []);
  const closeRestore = useCallback(() => setRestoring(null), []);
  const closePreview = useCallback(() => setPreviewing(null), []);
  const allIssues = [...issues, ...serverIssues] as typeof issues;
  const current = detail.history[0]?.version;
  const canPublish = detail.draft !== null && !dirty && issues.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {detail.draft ? (
          <Badge variant="warning">
            {t("admin.translation.legal.draftBadge")}
          </Badge>
        ) : null}
        {detail.published ? (
          <Badge variant="success">
            {t("admin.translation.legal.publishedBadge", {
              date: detail.published.effectiveDate,
              version: detail.published.version,
            })}
          </Badge>
        ) : (
          <Badge>{t("admin.translation.legal.notPublished")}</Badge>
        )}
        {dirty ? (
          <Badge variant="warning">
            {t("admin.translation.legal.unsaved")}
          </Badge>
        ) : null}
      </div>
      {conflict ? (
        <Alert variant="danger">
          <AlertTitle>{t("admin.translation.legal.conflictTitle")}</AlertTitle>
          <AlertDescription>
            {t("admin.translation.legal.conflict")}{" "}
            <Button onClick={onTakeStored} size="sm" variant="secondary">
              {t("admin.translation.legal.takeStored")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.published ? null : (
        <Alert>
          <AlertDescription>
            {t("admin.translation.legal.noText")}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!dirty || issues.length > 0}
          icon={<Save />}
          loading={save.isPending}
          onClick={onSave}
        >
          {t("admin.translation.legal.saveDraft")}
        </Button>
        <Button
          disabled={!canPublish}
          icon={<Send />}
          onClick={openPublish}
          variant="secondary"
        >
          {t("admin.translation.legal.publish")}
        </Button>
        <Button disabled={!dirty} onClick={onReset} variant="ghost">
          {t("admin.translation.legal.discardChanges")}
        </Button>
        {canPublish ? null : (
          <Text as="span" size="body-sm" tone="muted">
            {t("admin.translation.legal.publishNeeds")}
          </Text>
        )}
      </div>
      <Tabs defaultValue="edit">
        <TabsList aria-label={t("admin.translation.legal.views")}>
          <TabsTrigger value="edit">
            {t("admin.translation.legal.tabs.edit")}
          </TabsTrigger>
          <TabsTrigger value="preview">
            {t("admin.translation.legal.tabs.preview")}
          </TabsTrigger>
          {locale === LEGAL_CANONICAL_LOCALE ? null : (
            <TabsTrigger value="source">
              {t("admin.translation.legal.tabs.source")}
            </TabsTrigger>
          )}
          <TabsTrigger value="history">
            {t("admin.translation.legal.tabs.history")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="edit">
          <LegalEditor
            disabled={save.isPending}
            issues={allIssues}
            onChange={onChange}
            value={doc}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="preview">
          <LegalDocumentView
            contentsId="legal-preview-contents"
            doc={doc}
            effectiveDate={detail.published?.effectiveDate ?? today()}
            locale={locale}
            preview
          />
        </TabsContent>
        {canonical ? (
          <TabsContent className="pt-4" value="source">
            <Text className="pb-4" size="body-sm" tone="muted">
              {t("admin.translation.legal.sourceHint")}
            </Text>
            <LegalDocumentView
              contentsId="legal-source-contents"
              doc={canonical}
              effectiveDate={detail.published?.effectiveDate ?? today()}
              locale={LEGAL_CANONICAL_LOCALE}
              preview
            />
          </TabsContent>
        ) : null}
        <TabsContent className="pt-4" value="history">
          {detail.history.length === 0 ? (
            <Text tone="muted">{t("admin.translation.legal.noHistory")}</Text>
          ) : (
            <Table aria-label={t("admin.translation.legal.historyLabel")}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("admin.translation.legal.columns.version")}
                  </TableHead>
                  <TableHead>
                    {t("admin.translation.legal.columns.effective")}
                  </TableHead>
                  <TableHead>
                    {t("admin.translation.legal.columns.by")}
                  </TableHead>
                  <TableHead>
                    {t("admin.translation.legal.columns.at")}
                  </TableHead>
                  <TableHead>
                    {t("admin.translation.legal.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.history.map((version) => (
                  <HistoryRow
                    isAdmin={isAdmin}
                    isCurrent={version.version === current}
                    key={version.version}
                    onPreview={setPreviewing}
                    onRestore={setRestoring}
                    version={version}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {isAdmin ? null : (
            <Text className="pt-3" size="body-sm" tone="muted">
              {t("admin.translation.legal.restoreAdminOnly")}
            </Text>
          )}
        </TabsContent>
      </Tabs>
      <DateDialog
        confirmLabel={t("admin.translation.legal.publishConfirm")}
        description={t("admin.translation.legal.publishDescription")}
        onConfirm={onPublish}
        onOpenChange={closePublish}
        open={publishing}
        pending={publish.isPending}
        title={t("admin.translation.legal.publishTitle")}
      />
      <DateDialog
        confirmLabel={t("admin.translation.legal.restoreConfirm")}
        description={t("admin.translation.legal.restoreDescription", {
          version: restoring?.version ?? 0,
        })}
        onConfirm={onRestore}
        onOpenChange={closeRestore}
        open={restoring !== null}
        pending={restore.isPending}
        title={t("admin.translation.legal.restoreTitle", {
          version: restoring?.version ?? 0,
        })}
      />
      <VersionPreview
        kind={kind}
        locale={locale}
        onClose={closePreview}
        version={previewing}
      />
    </div>
  );
}

/** Whether the shipped catalogues of `locales` are in memory: the previews label themselves in their own language (the browser holds only the active one). */
function useCataloguesLoaded(locales: readonly string[]): boolean {
  const key = locales.join(",");
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(key.split(",").map(ensureCatalogues))
      .catch((error: unknown) => {
        console.error("[admin] Failed to load a catalogue:", error);
      })
      .then(() => {
        if (live) {
          setLoaded(key);
        }
      });
    return () => {
      live = false;
    };
  }, [key]);
  return loaded === key;
}

/** The editor of one legal text, loaded for (kind, language). */
export function LegalWorkspace({
  kind,
  locale,
}: {
  kind: LegalKind;
  locale: string;
}): ReactNode {
  const { t } = useTranslation();
  const detail = useLegalDetail({ kind, locale });
  const actions = useLegalActions();
  const catalogues = useCataloguesLoaded([locale, LEGAL_CANONICAL_LOCALE]);
  const { refetch } = detail;
  const onRetry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the legal text:", error);
    });
  }, [refetch]);
  if (detail.isError) {
    return (
      <ErrorState
        onRetry={onRetry}
        title={t("admin.translation.legal.errors.load")}
      />
    );
  }
  if (!(detail.data && catalogues)) {
    return <Skeleton className="h-64 w-full" />;
  }
  return (
    <WorkspaceBody
      actions={actions}
      detail={detail.data}
      // A new published version (a publish, or a restore by an admin) starts the editor again from the stored text.
      key={`${kind}:${locale}:${detail.data.published?.version ?? 0}`}
      kind={kind}
      locale={locale}
    />
  );
}
