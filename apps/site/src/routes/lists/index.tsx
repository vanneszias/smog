import { useTranslation } from "@smog/i18n/react";
import { useLists } from "@smog/lists/client";
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  ListItem,
  ListsEmptyState,
  useToast,
} from "@smog/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { GestureRowsSkeleton } from "@/components/learning/gesture-cards";
import { ListDetail } from "@/components/learning/lists/list-detail";
import {
  ListFormDialog,
  type ListFormValues,
} from "@/components/learning/lists/list-form-dialog";
import { Page, PageHeader } from "@/components/learning/page";
import { useHearts } from "@/components/learning/use-hearts";
import { pageMeta } from "@/lib/head";

export interface ListsSearch {
  id?: string;
}

export const Route = createFileRoute("/lists/")({
  component: Lists,
  head: ({ matches }) => pageMeta(matches, "nav.lists"),
  validateSearch: (search: Record<string, unknown>): ListsSearch =>
    typeof search.id === "string" && search.id.length > 0
      ? { id: search.id.slice(0, 64) }
      : {},
});

function Overview({ selected }: { selected: string | undefined }): ReactNode {
  const { t } = useTranslation();
  const lists = useLists();
  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    queryClient
      .invalidateQueries({ type: "active" })
      .catch((error: unknown) => {
        console.error("[lists] Failed to reload the lists:", error);
      });
  }, [queryClient]);
  if (lists.status === "loading") {
    return <GestureRowsSkeleton count={4} />;
  }
  if (lists.status === "error") {
    return <ErrorState onRetry={retry} />;
  }
  if (lists.lists.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("lists.all")}>
      <ul className="flex flex-col gap-1">
        {lists.lists.map((list) => (
          <li key={list.id}>
            <ListItem
              asChild
              className={cn(list.id === selected && "bg-primary-subtle")}
              description={t("lists.itemCount", { count: list.itemCount })}
              title={list.name}
              trailing={<ChevronRight aria-hidden />}
            >
              <Link
                aria-current={list.id === selected ? "page" : undefined}
                search={{ id: list.id }}
                to="/lists"
              >
                {list.name}
              </Link>
            </ListItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * My lists (spec §16 flow 2): the overview and the selected list
 * (`?id=`), side by side from `lg`; below it, one or the other. Guests'
 * lists live on the device, signed-in users' in the account (`useLists`
 * picks; the screen does not).
 */
function Lists(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const hearts = useHearts();
  const lists = useLists();
  const [creating, setCreating] = useState(false);
  const empty = lists.status === "ready" && lists.lists.length === 0;
  const openCreate = useCallback(() => setCreating(true), []);
  const { create } = lists;
  const createList = useCallback(
    async ({ description, name }: ListFormValues): Promise<void> => {
      try {
        const created = await create({
          description: description || undefined,
          name,
        });
        await navigate({ search: { id: created.id }, to: "/lists" });
      } catch (error) {
        toast({ title: t("states.actionFailed"), variant: "danger" });
        throw error;
      }
    },
    [create, navigate, t, toast]
  );

  const newList = (
    <Button icon={<Plus />} onClick={openCreate}>
      {t("lists.newList")}
    </Button>
  );

  let detail: ReactNode;
  if (id) {
    detail = <ListDetail hearts={hearts} id={id} key={id} />;
  } else if (!empty) {
    detail = (
      <EmptyState
        description={t("lists.select.description")}
        illustration={2}
        level={2}
        title={t("lists.select.title")}
      />
    );
  }

  return (
    <Page>
      <PageHeader
        actions={
          empty ? undefined : (
            // Below lg a selected list has the screen; the button stays on the overview.
            <div className={cn(id && "hidden lg:block")}>{newList}</div>
          )
        }
        description={t("lists.description")}
        title={t("nav.lists")}
      />
      {empty ? (
        <ListsEmptyState action={newList} level={2} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className={cn("min-w-0", id && "hidden lg:block")}>
            <Overview selected={id} />
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-col gap-4",
              !id && "hidden lg:flex"
            )}
          >
            {id ? (
              <Button asChild className="self-start lg:hidden" variant="ghost">
                <Link search={{}} to="/lists">
                  <ArrowLeft aria-hidden />
                  {t("lists.all")}
                </Link>
              </Button>
            ) : null}
            {detail}
          </div>
        </div>
      )}
      <ListFormDialog
        onOpenChange={setCreating}
        onSubmit={createList}
        open={creating}
        submitLabel={t("lists.create")}
        title={t("lists.newList")}
      />
    </Page>
  );
}
