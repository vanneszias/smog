import { useTranslation } from "@smog/i18n/react";
import { LOGO_CONTENT_TYPES } from "@smog/sponsorships/schema";
import { Button, cn, Text, useFieldControl } from "@smog/ui-web";
import { ImageUp, Trash2 } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { useObjectUrl } from "./use-object-url";

const ACCEPT = LOGO_CONTENT_TYPES.join(",");

export interface LogoDropzoneProps {
  file: Blob | null;
  /** The chosen file (checked by the caller), or `null` for Remove. */
  onChange: (file: File | null) => void;
}

/**
 * The logo picker (S-06): drop a file on the zone or browse; a 96 px
 * preview through an object URL with Remove; the guidelines. The input
 * takes its id and description from the surrounding `Field`, so its label
 * and error are announced. The type and the 2 MB are checked by the caller
 * (`validateDetails`), and again by the server, magic bytes included.
 */
export function LogoDropzone({ file, onChange }: LogoDropzoneProps): ReactNode {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const preview = useObjectUrl(file);
  const control = useFieldControl<{
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    id?: string;
  }>({});

  const pick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const chosen = event.target.files?.[0] ?? null;
      if (chosen) {
        onChange(chosen);
      }
      // The same file can be chosen again after Remove.
      event.target.value = "";
    },
    [onChange]
  );
  const drop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setOver(false);
      const [chosen] = event.dataTransfer.files;
      if (chosen) {
        onChange(chosen);
      }
    },
    [onChange]
  );
  const dragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(true);
  }, []);
  const dragLeave = useCallback(() => setOver(false), []);
  const browse = useCallback(() => input.current?.click(), []);
  const remove = useCallback(() => onChange(null), [onChange]);

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: a drop target; the button inside is the keyboard path. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the same drop target. */}
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center",
          over
            ? "border-primary bg-primary-subtle"
            : "border-border bg-surface",
          control.invalid && "border-danger"
        )}
        data-testid="logo-dropzone"
        onDragLeave={dragLeave}
        onDragOver={dragOver}
        onDrop={drop}
      >
        {preview ? (
          <div className="flex flex-wrap items-center justify-center gap-4">
            <img
              alt={t("sponsor.details.logo.previewAlt")}
              className="size-[6rem] rounded-md border border-border-subtle bg-surface-sunken object-contain"
              height={96}
              src={preview}
              width={96}
            />
            <div className="flex flex-col gap-2">
              <Button
                aria-describedby={control["aria-describedby"]}
                onClick={browse}
                size="sm"
                variant="secondary"
              >
                {t("sponsor.details.logo.replace")}
              </Button>
              <Button
                icon={<Trash2 />}
                onClick={remove}
                size="sm"
                variant="ghost"
              >
                {t("sponsor.details.logo.remove")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ImageUp
              aria-hidden="true"
              className="size-8 text-foreground-muted"
            />
            <Text>
              {t("sponsor.details.logo.drop")}{" "}
              <Button
                aria-describedby={control["aria-describedby"]}
                onClick={browse}
                size="sm"
                variant="secondary"
              >
                {t("sponsor.details.logo.browse")}
              </Button>
            </Text>
          </>
        )}
        <Text size="body-sm" tone="muted">
          {t("sponsor.details.logo.formats")}
        </Text>
        <input
          accept={ACCEPT}
          aria-describedby={control["aria-describedby"]}
          aria-invalid={control["aria-invalid"]}
          className="sr-only"
          id={control.id ?? "logo-upload"}
          onChange={pick}
          ref={input}
          tabIndex={-1}
          type="file"
        />
      </div>
    </>
  );
}

/** The logo guidelines (S-06), after the field so its error stays by it. */
export function LogoGuidelines(): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="rounded-md bg-surface-sunken p-4">
      <Text className="font-semibold" size="body-sm">
        {t("sponsor.details.logo.guidelines.title")}
      </Text>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body-sm text-foreground-muted">
        <li>{t("sponsor.details.logo.guidelines.format")}</li>
        <li>{t("sponsor.details.logo.guidelines.dimensions")}</li>
        <li>{t("sponsor.details.logo.guidelines.aspectRatio")}</li>
        <li>{t("sponsor.details.logo.guidelines.fileSize")}</li>
        <li>{t("sponsor.details.logo.guidelines.style")}</li>
        <li>{t("sponsor.details.logo.guidelines.avoid")}</li>
      </ul>
    </div>
  );
}
