import { useTranslation } from "@smog/i18n/react";
import { useShareLinks } from "@smog/lists/client";
import type { ShareLink as ShareLinkData, ShareRole } from "@smog/lists/schema";
import {
  Button,
  ShareLink,
  Sheet,
  SheetContent,
  SheetFooter,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-native";
import { setStringAsync } from "expo-clipboard";
import { useRouter } from "expo-router";
import Link from "lucide-react-native/icons/link";
import LogIn from "lucide-react-native/icons/log-in";
import Send from "lucide-react-native/icons/send";
import { type ReactElement, useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSheetScrollStyle } from "@/lib/sheet";
import { shareUrl } from "@/lib/site";

const ROLES: readonly ShareRole[] = ["view", "edit"];

export interface ListShareSheetProps {
  listId: string;
  listName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface RoleLinkProps {
  busy: boolean;
  link: ShareLinkData | null;
  onCopy: (url: string) => void;
  onCreate: (role: ShareRole) => void;
  onRevoke: (role: ShareRole) => void;
  onSend: (url: string) => void;
  role: ShareRole;
}

/** One role's link (copy, send, revoke), or the button that creates it. */
function RoleLink({
  busy,
  link,
  onCopy,
  onCreate,
  onRevoke,
  onSend,
  role,
}: RoleLinkProps): ReactElement {
  const { t } = useTranslation();
  const url = link?.url ?? "";
  const create = useCallback(() => onCreate(role), [onCreate, role]);
  const revoke = useCallback(() => onRevoke(role), [onRevoke, role]);
  const copy = useCallback(() => onCopy(url), [onCopy, url]);
  const send = useCallback(() => onSend(url), [onSend, url]);
  if (!link) {
    return (
      <Button
        icon={<Link />}
        loading={busy}
        onPress={create}
        variant="secondary"
      >
        {t(
          role === "edit" ? "lists.share.createEdit" : "lists.share.createView"
        )}
      </Button>
    );
  }
  return (
    <View className="gap-2">
      <ShareLink
        access={role}
        onCopy={copy}
        onRevoke={revoke}
        revoking={busy}
        url={url}
      />
      <Button
        className="self-start"
        icon={<Send />}
        onPress={send}
        variant="ghost"
      >
        {t("lists.share.send")}
      </Button>
    </View>
  );
}

/**
 * Sharing a list (spec §16): per role, the active link (copy, send with the
 * system share sheet, revoke) or a button that creates one. Sharing needs
 * an account, so guests (and guest lists) get a sign-in prompt instead.
 */
export function ListShareSheet({
  listId,
  listName,
  onOpenChange,
  open,
}: ListShareSheetProps): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const share = useShareLinks(listId);
  const [busy, setBusy] = useState<ShareRole | null>(null);
  const scrollStyle = useSheetScrollStyle();

  const report = useCallback(
    (error: unknown) => {
      console.error("[lists] Failed to change a share link:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    },
    [t, toast]
  );
  const run = useCallback(
    async (role: ShareRole, action: () => Promise<unknown>) => {
      setBusy(role);
      try {
        await action();
      } catch (error) {
        report(error);
      } finally {
        setBusy(null);
      }
    },
    [report]
  );
  const signIn = useCallback(() => {
    onOpenChange(false);
    router.push("/sign-in");
  }, [onOpenChange, router]);
  const onCreate = useCallback(
    (role: ShareRole) => {
      if (!share.requiresAccount) {
        run(role, () => share.create(role));
      }
    },
    [run, share]
  );
  const onRevoke = useCallback(
    (role: ShareRole) => {
      if (!share.requiresAccount) {
        run(role, () => share.revoke(role));
      }
    },
    [run, share]
  );
  const onCopy = useCallback(
    (url: string) => {
      setStringAsync(url).catch(report);
    },
    [report]
  );
  const onSend = useCallback(
    (url: string) => {
      shareUrl({
        message: t("lists.share.message", { name: listName, url }),
        title: listName,
        url,
      }).catch(report);
    },
    [listName, report, t]
  );

  if (share.requiresAccount) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent
          description={t("lists.share.signInDescription")}
          title={t("lists.share.signInTitle")}
        >
          <SheetFooter>
            <Button icon={<LogIn />} onPress={signIn}>
              {t("nav.signIn")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        description={t("lists.share.description")}
        title={t("lists.share.title")}
      >
        <ScrollView contentContainerClassName="gap-4" style={scrollStyle}>
          {share.status === "loading" ? <Skeleton className="h-16" /> : null}
          {share.status === "error" ? (
            <Text accessibilityRole="alert" tone="danger">
              {t("states.error.description")}
            </Text>
          ) : null}
          {share.status === "ready"
            ? ROLES.map((role) => (
                <RoleLink
                  busy={busy === role}
                  key={role}
                  link={share.links?.[role] ?? null}
                  onCopy={onCopy}
                  onCreate={onCreate}
                  onRevoke={onRevoke}
                  onSend={onSend}
                  role={role}
                />
              ))
            : null}
        </ScrollView>
      </SheetContent>
    </Sheet>
  );
}
