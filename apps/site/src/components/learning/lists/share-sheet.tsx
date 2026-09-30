import { useTranslation } from "@smog/i18n/react";
import { type ShareLinksState, useShareLinks } from "@smog/lists/client";
import type { ShareRole } from "@smog/lists/schema";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ErrorState,
  ShareLink,
  Sheet,
  SheetContent,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { copyText } from "@/lib/share";

const ROLES: readonly ShareRole[] = ["view", "edit"];

function RoleLink({
  role,
  share,
}: {
  role: ShareRole;
  share: ShareLinksState;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const link = share.links?.[role] ?? null;

  const fail = useCallback(
    (error: unknown): void => {
      console.error("[lists] Failed to change a share link:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    },
    [t, toast]
  );
  const run = useCallback(
    (action: () => Promise<unknown>): void => {
      setBusy(true);
      action()
        .catch(fail)
        .finally(() => setBusy(false));
    },
    [fail]
  );

  const { create, revoke } = share;
  const url = link?.url;
  const createLink = useCallback(
    () => run(() => create(role)),
    [create, role, run]
  );
  const revokeLink = useCallback(
    () => run(() => revoke(role)),
    [revoke, role, run]
  );
  const copy = useCallback((): void => {
    if (!url) {
      return;
    }
    copyText(url).catch(() => {
      toast({
        title: t("lists.share.copyFailed", { url }),
        variant: "danger",
      });
    });
  }, [t, toast, url]);

  if (!link) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              role === "edit"
                ? "lists.share.editTitle"
                : "lists.share.viewTitle"
            )}
          </CardTitle>
          <CardDescription>
            {t(
              role === "edit"
                ? "lists.share.editDescription"
                : "lists.share.viewDescription"
            )}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            icon={<Link2 />}
            loading={busy}
            onClick={createLink}
            variant="secondary"
          >
            {t(
              role === "edit"
                ? "lists.share.createEdit"
                : "lists.share.createView"
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }
  return (
    <ShareLink
      access={role}
      onCopy={copy}
      onRevoke={revokeLink}
      revoking={busy}
      url={link.url}
    />
  );
}

function ShareLinks({ listId }: { listId: string }): ReactNode {
  const { t } = useTranslation();
  const share = useShareLinks(listId);
  if (share.requiresAccount) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Text weight="semibold">{t("lists.share.signInTitle")}</Text>
        <Text tone="muted">{t("lists.share.signInDescription")}</Text>
        <Button asChild>
          <Link search={{ redirect: `/lists?id=${listId}` }} to="/sign-in">
            {t("nav.signIn")}
          </Link>
        </Button>
      </div>
    );
  }
  if (share.status === "error") {
    return <ErrorState level={3} />;
  }
  if (share.status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-32" shape="rect" />
        <Skeleton className="h-32" shape="rect" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {ROLES.map((role) => (
        <RoleLink key={role} role={role} share={share} />
      ))}
    </div>
  );
}

/**
 * The list's share sheet (spec §16 flow 2): a view link and an edit link,
 * each created on demand, copied and revoked. Sharing needs an account, so
 * guests (and their device lists) get a sign-in prompt instead.
 */
export function ShareSheet({
  listId,
  onOpenChange,
  open,
}: {
  listId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        description={t("lists.share.description")}
        title={t("lists.share.title")}
      >
        {open ? <ShareLinks listId={listId} /> : null}
      </SheetContent>
    </Sheet>
  );
}
