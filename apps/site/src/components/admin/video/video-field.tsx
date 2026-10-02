import { type MuxXhr, useMuxStatus } from "@smog/admin/client";
import { type MuxAssetItem, playbackIdSchema } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  VideoPlayer,
} from "@smog/ui-web";
import { Info } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { MuxPicker } from "./mux-picker";
import { MuxUpload, type MuxUploadResult } from "./mux-upload";

/** What a gesture stores about its video (`playback_id`, `mux_asset_id`). */
export interface VideoFieldValue {
  muxAssetId?: string | undefined;
  playbackId: string;
}

export interface VideoFieldProps {
  /** Tests pass a fake XHR for the upload. */
  createXhr?: () => MuxXhr;
  /** The visible label (`admin.mux.label` by default). */
  label?: ReactNode;
  onChange: (value: VideoFieldValue) => void;
  value: VideoFieldValue | null;
}

type VideoTab = "upload" | "choose" | "playbackId";

function PlaybackIdForm({
  initial,
  onUse,
}: {
  initial: string;
  onUse: (playbackId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const submit = useCallback(() => {
    const parsed = playbackIdSchema.safeParse(draft);
    setInvalid(!parsed.success);
    if (parsed.success) {
      onUse(parsed.data);
    }
  }, [draft, onUse]);
  const onInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    []
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // Never submit the gesture form around the field.
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    },
    [submit]
  );
  return (
    // A nested <form> is invalid inside the gesture form: a div with a
    // button that submits only this part.
    <div className="flex max-w-reading flex-col gap-3">
      <Field
        error={invalid ? t("admin.mux.playback.invalid") : undefined}
        hint={t("admin.mux.playback.hint")}
        label={t("admin.mux.playback.label")}
      >
        <Input
          autoComplete="off"
          onChange={onInput}
          onKeyDown={onKeyDown}
          spellCheck={false}
          value={draft}
        />
      </Field>
      <div>
        <Button onClick={submit} type="button" variant="secondary">
          {t("admin.mux.playback.use")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The gesture editor's video: the chosen video's preview, then three ways
 * to set it (ruling 4): upload a file straight to Mux, choose an existing
 * Mux asset, or paste a playback id. Without Mux configured (staging
 * before its secrets) only the playback id is offered, with a notice.
 */
export function VideoField({
  createXhr,
  label,
  onChange,
  value,
}: VideoFieldProps): ReactNode {
  const { t } = useTranslation();
  const status = useMuxStatus();
  const configured = status.data?.configured === true;
  const [tab, setTab] = useState<VideoTab>("upload");
  const active: VideoTab = configured ? tab : "playbackId";

  const onUploaded = useCallback(
    ({ assetId, playbackId }: MuxUploadResult) =>
      onChange({ muxAssetId: assetId, playbackId }),
    [onChange]
  );
  const onPick = useCallback(
    (asset: MuxAssetItem) =>
      onChange({ muxAssetId: asset.id, playbackId: asset.playbackId }),
    [onChange]
  );
  const onPaste = useCallback(
    (playbackId: string) => onChange({ playbackId }),
    [onChange]
  );
  const onTab = useCallback((next: string) => setTab(next as VideoTab), []);
  const { refetch } = status;
  const retryStatus = useCallback(() => {
    refetch().catch(() => undefined);
  }, [refetch]);

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-2 font-medium text-body text-foreground">
        {label ?? t("admin.mux.label")}
      </legend>
      {value ? (
        <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <VideoPlayer playbackId={value.playbackId} />
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-3 lg:col-span-5">
            <Text size="body-sm" weight="medium">
              {t("admin.mux.current")}
            </Text>
            <Text className="break-all" size="caption" tone="muted">
              {t("admin.mux.playbackIdValue", { id: value.playbackId })}
            </Text>
          </div>
        </div>
      ) : (
        <Text size="body-sm" tone="muted">
          {t("admin.mux.none")}
        </Text>
      )}
      {status.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {status.isError ? (
            // Unknown is not "not configured": say so, offer a retry, and
            // keep the pasted playback id usable below.
            <ErrorState
              description={t("admin.mux.statusError")}
              level={3}
              onRetry={retryStatus}
              retrying={status.isFetching}
            />
          ) : null}
          {configured || status.isError ? null : (
            <div
              className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3"
              data-testid="mux-not-configured"
              role="note"
            >
              <Info
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-foreground-muted"
              />
              <div className="flex flex-col gap-1">
                <Text size="body-sm" weight="medium">
                  {t("admin.mux.notConfigured.title")}
                </Text>
                <Text size="body-sm" tone="muted">
                  {t("admin.mux.notConfigured.description")}
                </Text>
              </div>
            </div>
          )}
          <Tabs onValueChange={onTab} value={active}>
            <TabsList>
              <TabsTrigger disabled={!configured} value="upload">
                {t("admin.mux.tabs.upload")}
              </TabsTrigger>
              <TabsTrigger disabled={!configured} value="choose">
                {t("admin.mux.tabs.choose")}
              </TabsTrigger>
              <TabsTrigger value="playbackId">
                {t("admin.mux.tabs.playbackId")}
              </TabsTrigger>
            </TabsList>
            {configured ? (
              <>
                {/* Kept mounted: switching tabs never drops a running upload. */}
                <TabsContent
                  className="data-[state=inactive]:hidden"
                  forceMount
                  value="upload"
                >
                  <MuxUpload
                    onUploaded={onUploaded}
                    {...(createXhr ? { createXhr } : {})}
                  />
                </TabsContent>
                <TabsContent value="choose">
                  <MuxPicker
                    enabled={active === "choose"}
                    onSelect={onPick}
                    selected={value}
                  />
                </TabsContent>
              </>
            ) : null}
            <TabsContent value="playbackId">
              <PlaybackIdForm
                initial={value?.muxAssetId ? "" : (value?.playbackId ?? "")}
                onUse={onPaste}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </fieldset>
  );
}
