import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { useLists } from "@smog/lists/client";
import type { ListSummary } from "@smog/lists/schema";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListItem,
  Skeleton,
} from "@smog/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, LogIn } from "lucide-react";
import { type ReactNode, useCallback } from "react";

function isShared(list: ListSummary): boolean {
  return list.shares.view || list.shares.edit;
}

function SharedRows({ lists }: { lists: readonly ListSummary[] }): ReactNode {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-1">
      {lists.map((list) => (
        <li key={list.id}>
          <ListItem
            asChild
            description={
              <span className="flex flex-wrap items-center gap-2">
                {list.shares.view ? (
                  <Badge variant="primary">{t("mySpace.shared.view")}</Badge>
                ) : null}
                {list.shares.edit ? (
                  <Badge variant="accent">{t("mySpace.shared.edit")}</Badge>
                ) : null}
                <span>{t("lists.itemCount", { count: list.itemCount })}</span>
              </span>
            }
            title={list.name}
            trailing={<ChevronRight aria-hidden />}
          >
            <Link search={{ id: list.id, tab: "lists" }} to="/my">
              {list.name}
            </Link>
          </ListItem>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Shared by me": the account's lists that have an active view or edit link
 * (`ListSummary.shares`), each opening in the Lists tab where the share
 * sheet revokes or renews the link. Sharing needs an account (spec §11),
 * so a guest is asked to sign in.
 */
export function SharedPanel(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const lists = useLists();
  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    queryClient
      .invalidateQueries({ type: "active" })
      .catch((error: unknown) => {
        console.error("[my] Failed to reload the shared lists:", error);
      });
  }, [queryClient]);
  if (auth.status === "loading" || lists.status === "loading") {
    return <Skeleton className="h-40 w-full" />;
  }
  if (auth.status === "signedOut") {
    return (
      <EmptyState
        action={
          <Button asChild icon={<LogIn />}>
            <Link search={{ redirect: "/my?tab=shared" }} to="/sign-in">
              {t("nav.signIn")}
            </Link>
          </Button>
        }
        description={t("mySpace.shared.guestDescription")}
        illustration={2}
        level={2}
        title={t("mySpace.shared.guestTitle")}
      />
    );
  }
  if (lists.status === "error") {
    return <ErrorState level={2} onRetry={retry} />;
  }
  const shared = lists.lists.filter(isShared);
  if (shared.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link search={{ tab: "lists" }} to="/my">
              {t("mySpace.shared.toLists")}
            </Link>
          </Button>
        }
        description={t("mySpace.shared.emptyDescription")}
        illustration={1}
        level={2}
        title={t("mySpace.shared.emptyTitle")}
      />
    );
  }
  return <SharedRows lists={shared} />;
}
