import { ORPCError } from "@orpc/client";
import { useTranslation } from "@smog/i18n/react";
import { SHARED_LIST_STALE_TIME, useSharedList } from "@smog/lists/client";
import type { ListItem } from "@smog/lists/schema";
import {
  Badge,
  Button,
  ErrorState,
  GestureRow,
  IconButton,
  ListItemsEmptyState,
  Text,
  useToast,
} from "@smog/ui-web";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import {
  GestureGridSkeleton,
  LinkedGestureGrid,
} from "@/components/learning/gesture-cards";
import { gestureHref, RouterLink } from "@/components/learning/links";
import { AddToSharedList } from "@/components/learning/lists/add-to-shared-list";
import { Page, PageHeader, RouteError } from "@/components/learning/page";
import {
  type Hearts,
  useHeart,
  useHearts,
} from "@/components/learning/use-hearts";
import { pageMeta, shellHead } from "@/lib/head";
import type { RouterContext } from "@/router";

// One public read; an unknown or revoked link is the 404 page.
async function loadSharedList({
  context,
  params,
}: {
  context: RouterContext;
  params: { shareToken: string };
}): Promise<{ name: string }> {
  const { queryClient, queryUtils } = context;
  const shared = await queryClient
    .ensureQueryData(
      queryUtils.lists.shared.get.queryOptions({
        input: { token: params.shareToken },
        staleTime: SHARED_LIST_STALE_TIME,
      })
    )
    .catch((error: unknown) => {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    });
  return { name: shared.list.name };
}

export const Route = createFileRoute("/lists/$shareToken")({
  component: SharedList,
  errorComponent: RouteError,
  // Shared lists are private to whoever has the link: never indexed.
  head: ({ loaderData, matches }) => {
    if (!loaderData) {
      return pageMeta(matches, "states.notFound.title");
    }
    const { t } = shellHead(matches);
    return {
      meta: [
        {
          title: `${loaderData.name} · ${t("nav.lists")} · ${t("common.appName")}`,
        },
        { content: "noindex", name: "robots" },
      ],
    };
  },
  loader: loadSharedList,
});

function EditableRow({
  hearts,
  item,
  onRemove,
}: {
  hearts: Hearts;
  item: ListItem;
  onRemove: (gestureId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const heart = useHeart(hearts, item.id);
  const remove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  return (
    <GestureRow
      favorite={heart.active}
      gesture={item}
      href={gestureHref(item.slug)}
      linkComponent={RouterLink}
      onFavoriteToggle={heart.onToggle}
      trailing={
        <IconButton
          icon={<Trash2 />}
          label={t("a11y.remove", { label: item.name })}
          onClick={remove}
        />
      }
    />
  );
}

/**
 * A list behind a share link (spec §9): anyone can view it; signed-in
 * people with an edit link can add and remove gestures. Guests opening an
 * edit link are asked to sign in first.
 */
function SharedList(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { shareToken } = Route.useParams();
  const shared = useSharedList(shareToken);
  const hearts = useHearts();
  const { addItem, data, removeItem } = shared;
  const fail = useCallback(
    (error: unknown): void => {
      console.error("[lists] Failed to change the shared list:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    },
    [t, toast]
  );
  const add = useCallback(
    (gestureId: string): void => {
      addItem(gestureId).catch(fail);
    },
    [addItem, fail]
  );
  const remove = useCallback(
    (gestureId: string): void => {
      removeItem(gestureId).catch(fail);
    },
    [fail, removeItem]
  );
  const present = useMemo(
    () => data?.items.map((item) => item.id) ?? [],
    [data]
  );

  if (!data) {
    return (
      <Page>
        {shared.status === "error" ? (
          <ErrorState level={2} />
        ) : (
          <GestureGridSkeleton />
        )}
      </Page>
    );
  }

  let items: ReactNode;
  if (data.items.length === 0) {
    items = <ListItemsEmptyState level={2} />;
  } else if (shared.canEdit) {
    items = (
      <ol className="flex flex-col gap-1">
        {data.items.map((item) => (
          <li key={item.id}>
            <EditableRow hearts={hearts} item={item} onRemove={remove} />
          </li>
        ))}
      </ol>
    );
  } else {
    items = <LinkedGestureGrid hearts={hearts} items={data.items} level={2} />;
  }

  return (
    <Page>
      <PageHeader
        actions={
          shared.canEdit ? (
            <AddToSharedList
              listName={data.list.name}
              onAdd={add}
              present={present}
            />
          ) : undefined
        }
        description={data.list.description ?? undefined}
        title={data.list.name}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={data.role === "edit" ? "primary" : "neutral"}>
          {t(
            data.role === "edit"
              ? "lists.sharedView.editable"
              : "lists.sharedView.viewOnly"
          )}
        </Badge>
        <Text size="body-sm" tone="muted">
          {t("lists.sharedView.by", { owner: data.list.ownerName })}
        </Text>
      </div>
      {shared.requiresSignIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <Text tone="muted">{t("lists.sharedView.signInToEdit")}</Text>
          <Button asChild size="sm" variant="secondary">
            <Link search={{ redirect: `/lists/${shareToken}` }} to="/sign-in">
              {t("nav.signIn")}
            </Link>
          </Button>
        </div>
      ) : null}
      {items}
    </Page>
  );
}
