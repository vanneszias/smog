import { useTranslation } from "@smog/i18n/react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import Square from "lucide-react-native/icons/square";
import Volume2 from "lucide-react-native/icons/volume-2";
import { type ReactElement, useCallback, useEffect, useRef } from "react";
import { Button, type ButtonProps } from "../components/button";
import { Switch } from "../components/switch";

interface Playing {
  stop: () => void;
}

/** The clip playing now in the app: one at a time (a new one stops it). */
let active: Playing | null = null;

/**
 * A spoken name is the point of the button: it plays with the iOS silent
 * switch on too (expo-audio follows the OS default session otherwise and
 * the press would do nothing audible). Idempotent, set on each play.
 */
function playInSilentMode(): void {
  setAudioModeAsync({ playsInSilentMode: true }).catch((error: unknown) => {
    console.error("[audioButton] Failed to set the audio mode:", error);
  });
}

export interface AudioButtonProps
  extends Omit<ButtonProps, "children" | "icon" | "loading" | "onPress"> {
  /** The clip's absolute URL (the site's `/api/audio/...` on the app's origin). */
  src: string;
}

/**
 * Plays a gesture's spoken name with expo-audio (phase 10b). It never plays
 * by itself and loads nothing until it is pressed; pressing it again stops
 * it; a clip playing elsewhere is stopped first. The caller renders it only
 * when the language has a clip: there is no fallback audio. The label says
 * what a press does (`media.audio.play` / `media.audio.stop`).
 */
export function AudioButton({
  src,
  size = "sm",
  variant = "secondary",
  ...props
}: AudioButtonProps): ReactElement {
  const { t } = useTranslation();
  // No initial source: nothing is fetched before the first press.
  const player = useAudioPlayer(null);
  const { playing } = useAudioPlayerStatus(player);
  const loaded = useRef<string | null>(null);
  const handle = useRef<Playing>({ stop: () => undefined });
  handle.current.stop = (): void => {
    player.pause();
  };

  // The screen went away: this button is not the active clip any more, and
  // the next press elsewhere must not pause a released player.
  useEffect(
    () => () => {
      if (active === handle.current) {
        active = null;
      }
    },
    []
  );

  const toggle = useCallback((): void => {
    if (playing) {
      player.pause();
      return;
    }
    try {
      active?.stop();
    } catch (error) {
      console.error("[audioButton] Failed to stop the other clip:", error);
    }
    active = handle.current;
    try {
      playInSilentMode();
      if (loaded.current === src) {
        // A clip that ended starts over.
        player.seekTo(0).catch((error: unknown) => {
          console.error("[audioButton] Failed to rewind:", error);
        });
      } else {
        player.replace({ uri: src });
        loaded.current = src;
      }
      player.play();
    } catch (error) {
      console.error("[audioButton] Failed to play:", error);
      active = null;
    }
  }, [player, playing, src]);

  return (
    <Button
      accessibilityRole="button"
      icon={playing ? <Square /> : <Volume2 />}
      onPress={toggle}
      size={size}
      variant={variant}
      {...props}
    >
      {playing ? t("media.audio.stop") : t("media.audio.play")}
    </Button>
  );
}

export interface NameOverlayToggleProps {
  /** Whether the name is shown over the video. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  testID?: string;
}

/** The viewer's own choice to hide the name over the video (kept on this device by the caller). */
export function NameOverlayToggle({
  checked,
  onCheckedChange,
  testID,
}: NameOverlayToggleProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Switch
      checked={checked}
      label={t("media.nameOverlay.toggle")}
      onCheckedChange={onCheckedChange}
      testID={testID}
    />
  );
}
