import { useTranslation } from "@smog/i18n/react";
import { Square, Volume2 } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "../components/button";
import { Switch } from "../components/switch";

interface Playing {
  stop: () => void;
}

/** The clip playing now, on this page: one at a time (a new one stops it). */
let active: Playing | null = null;

export interface AudioButtonProps
  extends Omit<
    ComponentProps<typeof Button>,
    "children" | "icon" | "onClick" | "type"
  > {
  /** Where the clip is (same origin: `/api/audio/...`). */
  src: string;
}

function ClipButton({
  src,
  variant = "secondary",
  size = "sm",
  ...props
}: AudioButtonProps): ReactNode {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const handle = useRef<Playing>({ stop: () => undefined });

  const stop = useCallback((): void => {
    const element = audio.current;
    if (element) {
      element.pause();
      element.currentTime = 0;
    }
    if (active === handle.current) {
      active = null;
    }
    setPlaying(false);
  }, []);
  handle.current.stop = stop;

  useEffect(() => {
    const { current } = handle;
    return () => {
      audio.current?.pause();
      audio.current = null;
      if (active === current) {
        active = null;
      }
    };
  }, []);

  const toggle = useCallback((): void => {
    if (playing) {
      stop();
      return;
    }
    active?.stop();
    active = handle.current;
    const element = audio.current ?? new Audio(src);
    element.preload = "none";
    element.onended = () => stop();
    element.onerror = () => {
      console.error(`[audioButton] Failed to load ${src}`);
      stop();
    };
    audio.current = element;
    setPlaying(true);
    element.play().catch((error: unknown) => {
      console.error("[audioButton] Failed to play:", error);
      stop();
    });
  }, [playing, src, stop]);

  return (
    <Button
      data-slot="audio-button"
      icon={playing ? <Square /> : <Volume2 />}
      onClick={toggle}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {playing ? t("media.audio.stop") : t("media.audio.play")}
    </Button>
  );
}

/**
 * Plays a gesture's spoken name (phase 10b). It is never started by itself
 * and loads nothing until it is pressed; pressing it again stops it; a clip
 * playing elsewhere on the page is stopped first. The caller renders it
 * only when the language has a clip: there is no fallback audio (a clip in
 * the wrong language is worse than none). A new `src` (another language or
 * gesture) is a new button, so a clip never plays on under another name.
 */
export function AudioButton(props: AudioButtonProps): ReactNode {
  return <ClipButton key={props.src} {...props} />;
}

export interface NameOverlayToggleProps {
  /** Whether the name is shown over the video. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** The viewer's own choice to hide the name over the video (kept on this device by the caller). */
export function NameOverlayToggle({
  checked,
  onCheckedChange,
}: NameOverlayToggleProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Switch
      checked={checked}
      label={t("media.nameOverlay.toggle")}
      onCheckedChange={onCheckedChange}
    />
  );
}
