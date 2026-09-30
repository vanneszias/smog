import { useTranslation } from "@smog/i18n/react";
import { type ReactElement, useCallback } from "react";
import { Button } from "../components/button";
import { Sheet, SheetContent, SheetFooter } from "../components/sheet";
import { TextLink } from "../components/text-link";

export interface ConsentBannerProps {
  /** Disables both choices while a decision is being saved. */
  busy?: boolean;
  onAllow: () => void;
  onDecline: () => void;
  /** A swipe, the backdrop or back: no decision (the app asks again later). */
  onDismiss: () => void;
  /** Opens the privacy policy (the site's `/privacy`). */
  onOpenPrivacy: () => void;
  open: boolean;
  /** On the sheet content (as the other overlays). */
  testID?: string;
}

/**
 * The analytics consent prompt (spec §10, §12, inventory P-06), the web
 * `ConsentBanner` as a bottom sheet: the purpose, a link to the privacy
 * policy and two equally sized choices. No close button: the choices are
 * the way out, and dismissing it leaves the decision open.
 */
export function ConsentBanner({
  busy = false,
  onAllow,
  onDecline,
  onDismiss,
  onOpenPrivacy,
  open,
  testID,
}: ConsentBannerProps): ReactElement {
  const { t } = useTranslation();
  const onOpenChange = useCallback(
    (next: boolean): void => {
      if (!next) {
        onDismiss();
      }
    },
    [onDismiss]
  );
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        description={t("consent.description")}
        hideClose
        testID={testID}
        title={t("consent.title")}
      >
        <TextLink className="self-start" onPress={onOpenPrivacy}>
          {t("consent.privacyLink")}
        </TextLink>
        <SheetFooter>
          <Button disabled={busy} onPress={onAllow}>
            {t("consent.allow")}
          </Button>
          <Button disabled={busy} onPress={onDecline} variant="secondary">
            {t("consent.decline")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
