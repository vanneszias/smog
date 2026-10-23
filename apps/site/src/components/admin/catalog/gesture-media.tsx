import { useAdminGestureMutations } from "@smog/admin/client";
import type { AdminGestureDetail } from "@smog/admin/schema";
import type { LanguageInfo, TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  type AudioProblem,
  audioFileProblem,
  audioProblemOf,
  useAudioActions,
  useGestureAudio,
} from "@smog/translation/client";
import type { AudioRow } from "@smog/translation/schema";
import {
  AudioButton,
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  ErrorState,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { Trash2, Upload } from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback, useRef } from "react";
import { useLocale } from "@/lib/locale";

const PROBLEM_KEYS = {
  duration: "media.admin.audio.errors.duration",
  format: "media.admin.audio.errors.format",
  generic: "media.admin.audio.errors.generic",
  key: "media.admin.audio.errors.key",
  missing: "media.admin.audio.errors.missing",
  network: "media.admin.audio.errors.network",
  tooLarge: "media.admin.audio.errors.tooLarge",
} as const satisfies Record<AudioProblem, TranslationKey>;

const ACCEPT = ".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a";

function AudioLanguageRow({
  gestureId,
  language,
  row,
}: {
  gestureId: string;
  language: LanguageInfo;
  row: AudioRow | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { remove, upload } = useAudioActions();
  const input = useRef<HTMLInputElement>(null);
  const choose = useCallback(() => input.current?.click(), []);
  const onFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // The same file may be chosen again after a refusal.
      event.target.value = "";
      if (!file) {
        return;
      }
      const problem = audioFileProblem(file);
      if (problem) {
        toast({ title: t(PROBLEM_KEYS[problem]), variant: "danger" });
        return;
      }
      upload
        .mutateAsync({ file, gestureId, locale: language.code })
        .then(() =>
          toast({ title: t("media.admin.audio.saved"), variant: "success" })
        )
        .catch((error: unknown) => {
          toast({
            title: t(PROBLEM_KEYS[audioProblemOf(error)]),
            variant: "danger",
          });
        });
    },
    [gestureId, language.code, t, toast, upload]
  );
  const onRemove = useCallback(() => {
    remove
      .mutateAsync({ gestureId, locale: language.code })
      .then(() =>
        toast({ title: t("media.admin.audio.removed"), variant: "success" })
      )
      .catch((error: unknown) => {
        console.error("[admin] Failed to remove the audio:", error);
        toast({
          title: t("media.admin.audio.errors.removeFailed"),
          variant: "danger",
        });
      });
  }, [gestureId, language.code, remove, t, toast]);
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
      data-language={language.code}
    >
      <Text className="min-w-24" lang={language.code} weight="medium">
        {language.name}
      </Text>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {row ? (
          <>
            <AudioButton src={row.path} />
            <Text size="body-sm" tone="muted">
              {t("media.admin.audio.duration", {
                seconds: (row.durationMs / 1000).toFixed(1),
              })}
            </Text>
          </>
        ) : (
          <Badge>{t("media.admin.audio.none")}</Badge>
        )}
      </div>
      <input
        accept={ACCEPT}
        aria-hidden="true"
        className="sr-only"
        data-testid={`audio-file-${language.code}`}
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
          {row ? t("media.admin.audio.replace") : t("media.admin.audio.choose")}
          <span className="sr-only"> ({language.name})</span>
        </Button>
        {row ? (
          <Button
            icon={<Trash2 />}
            loading={remove.isPending}
            onClick={onRemove}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("media.admin.audio.remove")}
            <span className="sr-only"> ({language.name})</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * A gesture's spoken name, one clip per enabled language, in the admin
 * editor (phase 10b task 6): play, replace and remove; the upload goes
 * straight to storage and the server checks the file (`finalizeAudio`).
 * The default language has a clip too, so it is listed with the others.
 */
export function GestureAudio({ gestureId }: { gestureId: string }): ReactNode {
  const { t } = useTranslation();
  const { languages } = useLocale();
  const query = useGestureAudio(gestureId);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the audio:", error);
    });
  }, [refetch]);
  let body: ReactNode = <Skeleton className="h-24 w-full" />;
  if (query.isError) {
    body = <ErrorState level={3} onRetry={retry} />;
  } else if (query.data) {
    const byLocale = new Map(query.data.items.map((row) => [row.locale, row]));
    body = (
      <ul className="divide-y divide-border-subtle">
        {languages.map((language) => (
          <AudioLanguageRow
            gestureId={gestureId}
            key={language.code}
            language={language}
            row={byLocale.get(language.code)}
          />
        ))}
      </ul>
    );
  }
  return (
    <Card className="gap-3 sm:p-4" id="audio">
      <CardContent className="gap-4">
        <CardTitle className="text-body" level={2}>
          {t("media.admin.audio.title")}
        </CardTitle>
        <Text size="body-sm" tone="muted">
          {t("media.admin.audio.description")}
        </Text>
        {body}
      </CardContent>
    </Card>
  );
}

/**
 * Whether the video still has the name in the picture, and the one action
 * that clears it: "video without text uploaded" (`gestures.recutDone`,
 * audited). Until then the player keeps its name overlay hidden.
 */
export function RecutCard({
  gesture,
}: {
  gesture: AdminGestureDetail;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { recutDone } = useAdminGestureMutations();
  const needs = gesture.needsRecut && !recutDone.isSuccess;
  const done = useCallback(() => {
    recutDone
      .mutateAsync({ id: gesture.id })
      .then(() =>
        toast({ title: t("media.admin.recut.doneSaved"), variant: "success" })
      )
      .catch((error: unknown) => {
        console.error("[admin] Failed to clear the re-cut flag:", error);
        toast({
          title: t("media.admin.recut.doneFailed"),
          variant: "danger",
        });
      });
  }, [gesture.id, recutDone, t, toast]);
  return (
    <Card className="gap-3 sm:p-4" id="recut">
      <CardContent className="gap-3">
        <CardTitle className="text-body" level={2}>
          {t("media.admin.recut.title")}
        </CardTitle>
        {needs ? (
          <>
            <Badge className="self-start" variant="warning">
              {t("media.admin.recut.needed")}
            </Badge>
            <Text size="body-sm" tone="muted">
              {t("media.admin.recut.description")}
            </Text>
            <div>
              <Button
                loading={recutDone.isPending}
                onClick={done}
                type="button"
                variant="secondary"
              >
                {t("media.admin.recut.done")}
              </Button>
            </div>
          </>
        ) : (
          <Badge className="self-start" variant="success">
            {t("media.admin.recut.ok")}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
