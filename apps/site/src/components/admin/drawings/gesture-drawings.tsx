import { useAuthState } from "@smog/auth/react";
import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  type DrawingProblem,
  drawingFileProblem,
  drawingProblemOf,
  useDrawingActions,
  useGestureDrawings,
} from "@smog/lessons/client";
import type { DrawingRow } from "@smog/lessons/schema";
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { Trash2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

const PROBLEM_KEYS = {
  dimensions: "drawings.errors.dimensions",
  format: "drawings.errors.format",
  generic: "drawings.errors.generic",
  key: "drawings.errors.key",
  missing: "drawings.errors.missing",
  network: "drawings.errors.network",
  tooLarge: "drawings.errors.tooLarge",
} as const satisfies Record<DrawingProblem, TranslationKey>;

const ACCEPT = ".png,.jpg,.jpeg,image/png,image/jpeg";
const KILOBYTE = 1024;

interface StepProps {
  canWrite: boolean;
  gestureId: string;
  name: string;
  /** Step 2 waits for step 1. */
  ready: boolean;
  /** Step 1 cannot be removed while step 2 exists (the server refuses too). */
  removeBlocked: boolean;
  row: DrawingRow | undefined;
  step: 1 | 2;
}

function StepPreview({
  name,
  row,
  step,
}: {
  name: string;
  row: DrawingRow;
  step: 1 | 2;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Line drawings are dark on white paper, as the PDF prints them. */}
      <img
        alt={t("drawings.previewAlt", { name, step })}
        className="max-h-48 w-auto max-w-full self-start rounded-md border border-border-subtle bg-white object-contain"
        height={row.height}
        loading="lazy"
        src={row.path}
        width={row.width}
      />
      <Text size="body-sm" tone="muted">
        {t("drawings.details", {
          height: row.height,
          size: Math.max(1, Math.round(row.size / KILOBYTE)),
          width: row.width,
        })}
      </Text>
      <Text size="body-sm">
        {row.credit
          ? t("drawings.credit", { credit: row.credit })
          : t("drawings.noCredit")}
      </Text>
    </div>
  );
}

function StepActions({
  gestureId,
  removeBlocked,
  row,
  step,
}: Pick<StepProps, "gestureId" | "removeBlocked" | "row" | "step">): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { remove, upload } = useDrawingActions();
  const input = useRef<HTMLInputElement>(null);
  const [credit, setCredit] = useState(row?.credit ?? "");
  const choose = useCallback(() => input.current?.click(), []);
  const onCredit = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setCredit(event.target.value),
    []
  );
  const onFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // The same file may be chosen again after a refusal.
      event.target.value = "";
      if (!file) {
        return;
      }
      const problem = drawingFileProblem(file);
      if (problem) {
        toast({ title: t(PROBLEM_KEYS[problem]), variant: "danger" });
        return;
      }
      upload
        .mutateAsync({ credit: credit.trim(), file, gestureId, step })
        .then(() => toast({ title: t("drawings.saved"), variant: "success" }))
        .catch((error: unknown) => {
          toast({
            title: t(PROBLEM_KEYS[drawingProblemOf(error)]),
            variant: "danger",
          });
        });
    },
    [credit, gestureId, step, t, toast, upload]
  );
  const onRemove = useCallback(() => {
    remove
      .mutateAsync({ gestureId, step })
      .then(() => toast({ title: t("drawings.removed"), variant: "success" }))
      .catch((error: unknown) => {
        console.error("[admin] Failed to remove the drawing:", error);
        toast({
          title: t("drawings.errors.removeFailed"),
          variant: "danger",
        });
      });
  }, [gestureId, remove, step, t, toast]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Field
        className="max-w-sm"
        hint={t("drawings.creditHint")}
        label={t("drawings.creditLabel")}
        optional
      >
        <Input
          autoComplete="off"
          maxLength={120}
          onChange={onCredit}
          value={credit}
        />
      </Field>
      <input
        accept={ACCEPT}
        aria-hidden="true"
        className="sr-only"
        data-testid={`drawing-file-${step}`}
        onChange={onFile}
        ref={input}
        tabIndex={-1}
        type="file"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Upload />}
          loading={upload.isPending}
          onClick={choose}
          size="sm"
          type="button"
          variant="secondary"
        >
          {row ? t("drawings.replace") : t("drawings.choose")}
          <span className="sr-only"> ({t("drawings.step", { step })})</span>
        </Button>
        {row && removeBlocked ? (
          <Text size="body-sm" tone="muted">
            {t("drawings.removeStep2First")}
          </Text>
        ) : null}
        {row && !removeBlocked ? (
          <AlertDialog
            confirmLabel={t("drawings.removeConfirm")}
            description={t("drawings.removeDescription", { step })}
            loading={remove.isPending}
            onConfirm={onRemove}
            title={t("drawings.removeTitle")}
            tone="danger"
          >
            <Button icon={<Trash2 />} size="sm" type="button" variant="ghost">
              {t("drawings.remove")}
              <span className="sr-only"> ({t("drawings.step", { step })})</span>
            </Button>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}

function DrawingStep({
  canWrite,
  gestureId,
  name,
  ready,
  removeBlocked,
  row,
  step,
}: StepProps): ReactNode {
  const { t } = useTranslation();
  const label = t(step === 1 ? "drawings.step" : "drawings.stepOptional", {
    step,
  });
  let controls: ReactNode = null;
  if (canWrite) {
    // Only an absent step waits for step 1: a stored drawing keeps Replace and Remove.
    controls =
      ready || row ? (
        <StepActions
          gestureId={gestureId}
          removeBlocked={removeBlocked}
          row={row}
          step={step}
        />
      ) : (
        <Text size="body-sm" tone="muted">
          {t("drawings.needFirst")}
        </Text>
      );
  }
  return (
    <li
      className="flex flex-col gap-3 py-4 sm:flex-row sm:gap-6"
      data-step={step}
    >
      <div className="flex min-w-32 flex-col items-start gap-2">
        <Text weight="medium">{label}</Text>
        {row ? null : <Badge>{t("drawings.none")}</Badge>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 md:flex-row">
        {row ? <StepPreview name={name} row={row} step={step} /> : null}
        {controls}
      </div>
    </li>
  );
}

function DrawingCardBody({
  canWrite,
  gestureId,
  name,
}: {
  canWrite: boolean;
  gestureId: string;
  name: string;
}): ReactNode {
  const query = useGestureDrawings(gestureId);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the drawings:", error);
    });
  }, [refetch]);
  if (query.isError) {
    return <ErrorState level={3} onRetry={retry} />;
  }
  if (!query.data) {
    return <Skeleton className="h-32 w-full" />;
  }
  const byStep = new Map(query.data.items.map((row) => [row.step, row]));
  return (
    <ul className="divide-y divide-border-subtle">
      {([1, 2] as const).map((step) => (
        <DrawingStep
          canWrite={canWrite}
          gestureId={gestureId}
          // A replaced drawing resets the credit field to its new value.
          key={`${step}-${byStep.get(step)?.updatedAt ?? 0}`}
          name={name}
          ready={step === 1 || byStep.has(1)}
          removeBlocked={step === 1 && byStep.has(2)}
          row={byStep.get(step)}
          step={step}
        />
      ))}
    </ul>
  );
}

/**
 * A gesture's drawings in the admin editor (phase 10c task 3, spec 5.2):
 * step 1, an optional step 2, the credit printed under the drawing, a
 * preview and a delete. The image comes from the private route
 * (`/api/teacher/drawings/...`), so only the teaching roles see anything:
 * the card renders nothing for anyone else, and is read-only for a
 * translator (no button, no field). The upload goes straight to storage and
 * the server checks the file (`finalizeDrawing`).
 */
export function GestureDrawingCard({
  gestureId,
  name,
}: {
  gestureId: string;
  name: string;
}): ReactNode {
  const { t } = useTranslation();
  const { user } = useAuthState();
  const roles = user?.roles ?? [];
  const canWrite = roles.includes("teacher") || roles.includes("admin");
  const canRead = canWrite || roles.includes("translator");
  if (!canRead) {
    return null;
  }
  return (
    <Card className="gap-3 sm:p-4" id="drawings">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("drawings.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("drawings.description")}
        </Text>
        {canWrite ? null : <Text size="body-sm">{t("drawings.readOnly")}</Text>}
        <DrawingCardBody
          canWrite={canWrite}
          gestureId={gestureId}
          name={name}
        />
      </CardContent>
    </Card>
  );
}
