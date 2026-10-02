import { useTranslation } from "@smog/i18n/react";
import Check from "lucide-react-native/icons/check";
import Copy from "lucide-react-native/icons/copy";
import Link2Off from "lucide-react-native/icons/link-2-off";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, View, type ViewProps } from "react-native";
import { AlertDialog } from "../components/alert-dialog";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { Heading, Text } from "../components/text";
import { cn } from "../lib/cn";

/** How long the copy button says "Copied". */
const COPIED_MS = 2000;

export type ShareAccess = "view" | "edit";

export interface ShareLinkProps extends Omit<ViewProps, "children"> {
  /** `view` links show the list; `edit` links also let signed-in people edit it. */
  access: ShareAccess;
  className?: string;
  /**
   * The caller copies `url` (expo-clipboard) and must surface a failure
   * itself (a toast); the button confirms "Copied" either way.
   */
  onCopy: () => void;
  /** Called after the user confirms; the link stops working at once. */
  onRevoke: () => void;
  /** Busy state of the revoke confirmation. */
  revoking?: boolean;
  url: string;
}

/** One active share link of a list: what it allows, the url, copy and revoke. */
export function ShareLink({
  className,
  onCopy,
  onRevoke,
  revoking = false,
  access,
  url,
  ...props
}: ShareLinkProps): ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = useCallback((): void => {
    onCopy();
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(t("kit.copied"));
  }, [onCopy, t]);
  return (
    <View
      className={cn(
        "flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4",
        className
      )}
      {...props}
    >
      <View className="flex-col gap-1">
        <Heading size="title-3">
          {t(
            access === "edit"
              ? "lists.share.editTitle"
              : "lists.share.viewTitle"
          )}
        </Heading>
        <Text size="body-sm" tone="muted">
          {t(
            access === "edit"
              ? "lists.share.editDescription"
              : "lists.share.viewDescription"
          )}
        </Text>
      </View>
      <Input
        accessibilityLabel={t("lists.share.linkLabel")}
        editable={false}
        selectTextOnFocus
        value={url}
      />
      <View className="flex-row flex-wrap gap-3">
        <Button
          icon={copied ? <Check /> : <Copy />}
          onPress={copy}
          variant="secondary"
        >
          {copied ? t("kit.copied") : t("lists.share.copyLink")}
        </Button>
        <AlertDialog
          confirmLabel={t("lists.share.revokeConfirm")}
          description={t("lists.share.revokeDescription")}
          loading={revoking}
          onConfirm={onRevoke}
          title={t("lists.share.revokeTitle")}
          tone="danger"
        >
          <Button icon={<Link2Off />} variant="ghost">
            {t("lists.share.revoke")}
          </Button>
        </AlertDialog>
      </View>
    </View>
  );
}
