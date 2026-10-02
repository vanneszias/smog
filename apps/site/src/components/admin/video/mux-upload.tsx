import {
  type MuxFile,
  type MuxUploadFailure,
  type MuxUploadState,
  type MuxXhr,
  useMuxUpload,
} from "@smog/admin/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, cn, ProgressBar, Text, VideoPlayer } from "@smog/ui-web";
import { CircleAlert, CircleCheck, Upload } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface MuxUploadResult {
  assetId: string;
  playbackId: string;
}

export interface MuxUploadProps {
  /** Tests pass a fake XHR (`@smog/admin/client` `MuxXhr`). */
  createXhr?: () => MuxXhr;
  /** Once per finished upload, with the new asset. */
  onUploaded: (result: MuxUploadResult) => void;
}

const FAILURE_KEYS = {
  cancelled: "admin.mux.upload.failed.cancelled",
  create: "admin.mux.upload.failed.create",
  processing: "admin.mux.upload.failed.processing",
  slow: "admin.mux.upload.failed.slow",
  transfer: "admin.mux.upload.failed.transfer",
} as const satisfies Record<MuxUploadFailure, string>;

function isVideo(file: MuxFile): boolean {
  return file.type.startsWith("video/");
}

/** Drag and drop, or the browse button (the keyboard path). */
function DropZone({ onFile }: { onFile: (file: File) => void }): ReactNode {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [notVideo, setNotVideo] = useState(false);

  const choose = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }
      setNotVideo(!isVideo(file));
      if (isVideo(file)) {
        onFile(file);
      }
    },
    [onFile]
  );
  const onInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      choose(event.target.files?.[0]);
      // The same file again is a new choice.
      event.target.value = "";
    },
    [choose]
  );
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(false);
      choose(event.dataTransfer.files[0]);
    },
    [choose]
  );
  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const browse = useCallback(() => inputRef.current?.click(), []);

  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the drop target; the button inside is the keyboard path. */}
      <section
        aria-label={t("admin.mux.upload.drop")}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center",
          dragging
            ? "border-primary bg-primary-subtle"
            : "border-border bg-surface-sunken"
        )}
        data-testid="mux-dropzone"
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Upload aria-hidden="true" className="size-8 text-foreground-muted" />
        <Text weight="medium">{t("admin.mux.upload.drop")}</Text>
        <Text size="body-sm" tone="muted">
          {t("admin.mux.upload.or")}
        </Text>
        <Button
          aria-describedby={hintId}
          onClick={browse}
          type="button"
          variant="secondary"
        >
          {t("admin.mux.upload.browse")}
        </Button>
        <input
          accept="video/*"
          aria-label={t("admin.mux.upload.browse")}
          className="sr-only"
          data-testid="mux-file-input"
          onChange={onInput}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
        <Text id={hintId} size="caption" tone="muted">
          {t("admin.mux.upload.hint")}
        </Text>
      </section>
      {notVideo ? (
        <Text role="alert" size="body-sm" tone="danger">
          {t("admin.mux.upload.notVideo")}
        </Text>
      ) : null}
    </div>
  );
}

type BusyState = Extract<
  MuxUploadState,
  { status: "creating" | "uploading" | "processing" }
>;

function BusyMessage({ state }: { state: BusyState }): ReactNode {
  const { t } = useTranslation();
  if (state.status === "creating") {
    return t("admin.mux.upload.creating");
  }
  if (state.status === "uploading") {
    return t("admin.mux.upload.uploading", {
      name: state.file.name,
      percent: Math.round(state.progress * 100),
    });
  }
  return t("admin.mux.upload.processing");
}

/**
 * The upload tab of `VideoField`: drag and drop or browse (`video/*`), the
 * PUT straight to Mux with a ProgressBar, the processing wait (polls every
 * 2 s, gives up after 10 minutes with "check again"), then the ready video
 * and "Upload another". Copy is `admin.mux.upload.*`.
 */
export function MuxUpload({
  createXhr,
  onUploaded,
}: MuxUploadProps): ReactNode {
  const { t } = useTranslation();
  const { reset, retry, start, state } = useMuxUpload(
    createXhr ? { createXhr } : {}
  );
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "ready" && reported.current !== state.uploadId) {
      reported.current = state.uploadId;
      onUploaded({ assetId: state.assetId, playbackId: state.playbackId });
    }
  }, [onUploaded, state]);

  if (state.status === "idle") {
    return <DropZone onFile={start} />;
  }

  if (state.status === "ready") {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <VideoPlayer playbackId={state.playbackId} title={state.file.name} />
        </div>
        <Text className="flex items-center gap-2" role="status" tone="success">
          <CircleCheck aria-hidden="true" className="size-5" />
          {t("admin.mux.upload.ready")}
        </Text>
        <div>
          <Button onClick={reset} type="button" variant="secondary">
            {t("admin.mux.upload.another")}
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <Text className="flex items-start gap-2" tone="danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t(FAILURE_KEYS[state.reason])}
        </Text>
        {state.detail ? (
          <Text className="break-words" size="caption" tone="muted">
            {state.detail}
          </Text>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={retry} type="button">
            {state.reason === "slow"
              ? t("admin.mux.upload.checkAgain")
              : t("admin.mux.upload.retry")}
          </Button>
          <Button onClick={reset} type="button" variant="ghost">
            {t("admin.mux.upload.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Text aria-live="polite" role="status" size="body-sm">
        <BusyMessage state={state} />
      </Text>
      <ProgressBar
        label={t("admin.mux.upload.progressLabel")}
        value={
          state.status === "uploading" ? Math.round(state.progress * 100) : null
        }
      />
      {state.status === "processing" ? (
        <Text size="caption" tone="muted">
          {t("admin.mux.upload.processingHint")}
        </Text>
      ) : null}
      <div>
        <Button onClick={reset} type="button" variant="ghost">
          {t("admin.mux.upload.cancel")}
        </Button>
      </div>
    </div>
  );
}
